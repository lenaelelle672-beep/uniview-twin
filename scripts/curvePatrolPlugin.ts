import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的巡游体接线摘掉。
 * drei CurveModifier 和 three-stdlib Flow 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把监听分包接回 dock。导览会话开始才请求身体、CurveModifier 和 Flow。
 */
export const CURVE_PATROL_SOURCE_BLOCK = `// T128：巡游体沿导览轨。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../tour-path/curveMount').then((mod) => {
  mod.mountCurvePatrol()
})
`

/** three 0.186.1 constants.js。入口没有具名导出时用这些数，不另打一份 three。 */
export const FLOW_FALLBACK = {
  RepeatWrapping: 1000,
  DynamicDrawUsage: 35048,
} as const

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/tour-path/curveMount.ts', import.meta.url))
const BODY_ENTRY = fileURLToPath(new URL('../src/tour-path/curveSession.tsx', import.meta.url))
const DREI_CURVE = fileURLToPath(new URL('../node_modules/@react-three/drei/core/CurveModifier.js', import.meta.url))
const FLOW_ENTRY = fileURLToPath(new URL('../node_modules/three-stdlib/modifiers/CurveModifier.js', import.meta.url))
const CATMULL_ROM = fileURLToPath(
  new URL('../node_modules/three/src/extras/curves/CatmullRomCurve3.js', import.meta.url),
)

const FLOW_REQUIRED = ['Mesh', 'Matrix4', 'DataTexture', 'RGBAFormat', 'FloatType', 'NearestFilter'] as const

const GATE =
  /mountCurvePatrol|TourPatrolBody|CurveModifier|moveAlongCurve|curveSession|curveMount|spineTexture|__twinCurvePatrol/

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function isChunk(item: { type: string }): item is BundleChunk {
  return item.type === 'chunk'
}

function chunksOf(bundle: Record<string, { type: string }>): BundleChunk[] {
  return Object.values(bundle).filter(isChunk)
}

export function stripCurvePatrolSource(code: string): string {
  if (!code.includes(CURVE_PATROL_SOURCE_BLOCK)) {
    throw new Error('T128：dock 里的巡游体接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(CURVE_PATROL_SOURCE_BLOCK, '')
  if (next.includes('mountCurvePatrol') || next.includes('curveMount') || next.includes('__twinCurvePatrol')) {
    throw new Error('T128：摘完 dock 仍留着巡游体接线')
  }
  return next
}

function exportMap(code: string): Map<string, string> {
  const at = code.lastIndexOf('export{')
  const tail = at >= 0 ? code.slice(at) : ''
  const map = new Map<string, string>()
  for (const match of tail.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    map.set(match[1] ?? '', match[2] ?? '')
  }
  return map
}

function portalLocals(code: string): string[] {
  const found: string[] = []
  const patterns = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s*\{return[^\{]*\{children:\s*\2\s*,\s*container:\s*\3\s*,\s*state:\s*\4\s*\}/g,
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function\s*)?\(([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s*=>\s*[^\{]*\{children:\s*\2\s*,\s*container:\s*\3\s*,\s*state:\s*\4\s*\}/g,
  ]
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1]) found.push(match[1])
    }
  }
  return found
}

/** 从已经压缩的产物里认出 fiber createPortal 的导出名。 */
export function findCreatePortalBinding(chunks: Array<{ fileName: string; code: string }>): {
  file: string
  exportName: string
} {
  const hits: Array<{ file: string; exportName: string }> = []
  for (const chunk of chunks) {
    const exported = exportMap(chunk.code)
    for (const local of portalLocals(chunk.code)) {
      const exportName = exported.get(local)
      if (!exportName) continue
      const file = chunk.fileName.startsWith('assets/') ? chunk.fileName.slice('assets/'.length) : chunk.fileName
      hits.push({ file, exportName })
    }
  }
  const indexHit = hits.find((hit) => hit.file.startsWith('index-'))
  const hit = indexHit ?? hits[0]
  if (!hit) {
    const sample = chunks
      .map((chunk) => chunk.code)
      .join('\n')
      .match(/.{0,60}children:\s*[A-Za-z_$][\w$]*\s*,\s*container:\s*[A-Za-z_$][\w$]*\s*,\s*state:\s*[A-Za-z_$][\w$]*.{0,40}/)
    throw new Error(`T128：产物里没有可导入的 createPortal ${sample?.[0] ?? ''}`)
  }
  return hit
}

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useImperativeHandle = React.useImperativeHandle
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const Fragment = React.Fragment
`
}

function jsxShim(indexFile: string, react: string, jsx: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${jsx} as runtime, ${react} as React } from ${from}
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = React.Fragment
`
}

function useThreeShim(indexFile: string, useThree: string): string {
  return `import { ${useThree} as useThree } from ${JSON.stringify(`./${indexFile}`)}
export { useThree }
`
}

function portalShim(file: string, exportName: string): string {
  return `import { ${exportName} as createPortal } from ${JSON.stringify(`./${file}`)}
export { createPortal }
`
}

function bodyThreeShim(indexFile: string, found: Record<string, string>): string {
  if (!found.Vector3) throw new Error('T128：入口包没有 Vector3')
  const from = JSON.stringify(`./${indexFile}`)
  if (found.CatmullRomCurve3) {
    return `import { ${found.Vector3} as Vector3, ${found.CatmullRomCurve3} as CatmullRomCurve3 } from ${from}
export { Vector3, CatmullRomCurve3 }
`
  }
  return `import { ${found.Vector3} as Vector3 } from ${from}
export { Vector3 }
export { CatmullRomCurve3 } from ${JSON.stringify(CATMULL_ROM)}
`
}

function modifierThreeShim(indexFile: string, found: Record<string, string>): string {
  const from = JSON.stringify(`./${indexFile}`)
  if (found.Scene) {
    return `import { ${found.Scene} as Scene } from ${from}
export { Scene }
`
  }
  if (!found.Object3D) throw new Error('T128：入口包没有 Scene，也没有 Object3D')
  return `import { ${found.Object3D} as Object3D } from ${from}
export class Scene extends Object3D {
  constructor() {
    super()
    this.isScene = true
    this.type = 'Scene'
  }
}
`
}

function flowThreeShim(indexFile: string, found: Record<string, string>): string {
  const absent = FLOW_REQUIRED.filter((key) => !found[key])
  if (absent.length > 0) throw new Error(`T128：入口包缺 three 导出 ${absent.join(', ')}`)
  const named: string[] = [...FLOW_REQUIRED]
  if (found.RepeatWrapping) named.push('RepeatWrapping')
  if (found.DynamicDrawUsage) named.push('DynamicDrawUsage')
  if (found.InstancedMesh) named.push('InstancedMesh')
  const spec = named.map((key) => `${found[key]} as ${key}`).join(', ')
  const lines = [
    `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}`,
    `export { ${named.join(', ')} }`,
  ]
  if (!found.RepeatWrapping) lines.push(`export const RepeatWrapping = ${FLOW_FALLBACK.RepeatWrapping}`)
  if (!found.DynamicDrawUsage) lines.push(`export const DynamicDrawUsage = ${FLOW_FALLBACK.DynamicDrawUsage}`)
  if (!found.InstancedMesh) lines.push('export class InstancedMesh {}')
  return `${lines.join('\n')}\n`
}

function shimPlugin(options: {
  external: Set<string>
  react: string
  jsx: string
  fiber: string
  three: string
  externalDrei: boolean
  externalFlow: boolean
  externalSession: boolean
  curveMath: { indexFile: string; Vector2: string; Vector3: string; Matrix4: string } | null
}): EsbuildPlugin {
  return {
    name: 'curve-patrol-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/[^/]+\.js$/ }, (args) => {
        if (!options.external.has(args.path)) return null
        return { path: args.path, external: true }
      })
      if (options.externalSession) {
        build.onResolve({ filter: /curveSession(?:\.tsx)?$/ }, () => ({
          path: './CurvePatrolBody.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'curve-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'curve-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'curve-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'curve-shim' }))
      if (options.externalDrei) {
        build.onResolve({ filter: /^@react-three\/drei\/core\/CurveModifier(?:\.js)?$/ }, () => ({
          path: './CurveModifier.js',
          external: true,
        }))
      }
      if (options.externalFlow) {
        build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: './Flow.js', external: true }))
      }
      const math = options.curveMath
      if (math) {
        if (!math.Vector3 || !math.Matrix4) throw new Error('T128：入口包没有 Vector3 或 Matrix4，曲线不能复用')
        const fromThreeSrc = (args: { path: string; resolveDir: string }) =>
          args.resolveDir.includes('/three/src/') || args.path.includes('/three/src/')
        build.onResolve({ filter: /Vector3\.js$/ }, (args) =>
          fromThreeSrc(args) ? { path: 'vec3', namespace: 'curve-math' } : null,
        )
        build.onResolve({ filter: /Vector2\.js$/ }, (args) =>
          fromThreeSrc(args) ? { path: 'vec2', namespace: 'curve-math' } : null,
        )
        build.onResolve({ filter: /Matrix4\.js$/ }, (args) =>
          fromThreeSrc(args) ? { path: 'mat4', namespace: 'curve-math' } : null,
        )
        build.onResolve({ filter: /MathUtils\.js$/ }, (args) =>
          fromThreeSrc(args) ? { path: 'math', namespace: 'curve-math' } : null,
        )
        build.onResolve({ filter: /utils\.js$/ }, (args) =>
          fromThreeSrc(args) && (args.path === '../../utils.js' || args.path.endsWith('/three/src/utils.js'))
            ? { path: 'utils', namespace: 'curve-math' }
            : null,
        )
        build.onLoad({ filter: /.*/, namespace: 'curve-math' }, (args) => {
          const from = JSON.stringify(`./${math.indexFile}`)
          const contents =
            args.path === 'vec3'
              ? `export { ${math.Vector3} as Vector3 } from ${from}\n`
              : args.path === 'vec2'
                ? math.Vector2
                  ? `export { ${math.Vector2} as Vector2 } from ${from}\n`
                  : 'export class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y } }\n'
                : args.path === 'mat4'
                  ? `export { ${math.Matrix4} as Matrix4 } from ${from}\n`
                  : args.path === 'math'
                    ? 'export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }\n'
                    : 'export function warn() {}\n'
          return { contents, loader: 'js', resolveDir: ROOT }
        })
      }
      build.onLoad({ filter: /.*/, namespace: 'curve-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? options.react
            : args.path === 'jsx'
              ? options.jsx
              : args.path === 'fiber'
                ? options.fiber
                : options.three
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(entry: string, plugin: EsbuildPlugin): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [plugin],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T128：分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T128：分包没有打成单个文件')
  return file.text
}

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T128：${label} 语法检查失败 ${result.stderr}`)
}

function assertClean(source: string, label: string): void {
  if (/useFrame|gsap|anime|MotionPathControls|CorridorPeople|jsdelivr|balancedFx|FogExp2/.test(source)) {
    throw new Error(`T128：${label} 带了禁项`)
  }
  const link = source.match(/https?:\/\/[^"'\\\s)]+/)
  if (link) throw new Error(`T128：${label} 带了外链 ${link[0]}`)
  if (/from["']three["']|from["']@react-three\/drei["']|from["']three-stdlib["']/.test(source)) {
    throw new Error(`T128：${label} 还在引用 three / drei / three-stdlib 入口`)
  }
}

function asset(fileName: string, source: string) {
  return {
    type: 'asset' as const,
    fileName,
    name: fileName,
    names: [fileName],
    originalFileName: null,
    originalFileNames: [] as string[],
    source,
    needsCodeReference: false,
  }
}

export function curvePatrolAfterHash(): Plugin {
  return {
    name: 'curve-patrol-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripCurvePatrolSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) throw new Error('T128：找不到入口包、dock、DemandLoop 或 balancedFx')
      for (const chunk of chunks) {
        if (GATE.test(chunk.code)) throw new Error(`T128：巡游体被打进了 vite 分包 ${chunk.fileName}`)
      }
      const names: GridBindings = discoverGridBindings(index.code, dock.code, loop.code)
      const looked = lookupThreeExports(index.code, [
        'Vector2',
        'Vector3',
        'Matrix4',
        'CatmullRomCurve3',
        'Scene',
        'Object3D',
        ...FLOW_REQUIRED,
        'RepeatWrapping',
        'DynamicDrawUsage',
        'InstancedMesh',
      ])
      const portal = findCreatePortalBinding(chunks)
      const external = new Set([`./${names.indexFile}`, `./${portal.file}`, './CurveModifier.js', './Flow.js'])
      const react = reactShim(names.indexFile, names.react)
      const jsx = jsxShim(names.indexFile, names.react, names.jsx)
      const mount = await bundleEntry(
        MOUNT_ENTRY,
        shimPlugin({
          external,
          react,
          jsx,
          fiber: '',
          three: '',
          externalDrei: false,
          externalFlow: false,
          externalSession: true,
          curveMath: null,
        }),
      )
      const body = await bundleEntry(
        BODY_ENTRY,
        shimPlugin({
          external,
          react,
          jsx,
          fiber: useThreeShim(names.indexFile, names.useThree),
          three: bodyThreeShim(names.indexFile, looked.found),
          externalDrei: true,
          externalFlow: false,
          externalSession: false,
          curveMath: looked.found.CatmullRomCurve3
            ? null
            : {
                indexFile: names.indexFile,
                Vector2: looked.found.Vector2 ?? '',
                Vector3: looked.found.Vector3 ?? '',
                Matrix4: looked.found.Matrix4 ?? '',
              },
        }),
      )
      const modifier = await bundleEntry(
        DREI_CURVE,
        shimPlugin({
          external,
          react,
          jsx,
          fiber: portalShim(portal.file, portal.exportName),
          three: modifierThreeShim(names.indexFile, looked.found),
          externalDrei: false,
          externalFlow: true,
          externalSession: false,
          curveMath: null,
        }),
      )
      const flow = await bundleEntry(
        FLOW_ENTRY,
        shimPlugin({
          external,
          react,
          jsx,
          fiber: '',
          three: flowThreeShim(names.indexFile, looked.found),
          externalDrei: false,
          externalFlow: false,
          externalSession: false,
          curveMath: null,
        }),
      )
      for (const [label, source] of [
        ['CurvePatrolMount', mount],
        ['CurvePatrolBody', body],
        ['CurveModifier', modifier],
        ['Flow', flow],
      ] as const) {
        assertSyntax(source, label)
        assertClean(source, label)
      }
      if (!mount.includes('./CurvePatrolBody.js') || !mount.includes('mountCurvePatrol')) {
        throw new Error('T128：监听分包没有延迟加载巡游体')
      }
      if (/CurveModifier|moveAlongCurve|TourPatrolBody|spineTexture|@react-three|useFrame/.test(mount)) {
        throw new Error('T128：监听分包把 CurveModifier 打进去了')
      }
      if (!body.includes('./CurveModifier.js') || !body.includes('TourPatrolBody') || !body.includes('moveAlongCurve')) {
        throw new Error('T128：巡游体分包没有接上 CurveModifier')
      }
      if (/spineTexture|onBeforeCompile|useFrame/.test(body)) {
        throw new Error('T128：巡游体分包把 Flow 打进去了')
      }
      if (!modifier.includes('./Flow.js') || !modifier.includes(`./${portal.file}`) || modifier.includes('useFrame')) {
        throw new Error('T128：CurveModifier 分包不是 createPortal + Flow')
      }
      if (/spineTexture|moveAlongCurve/.test(modifier)) {
        throw new Error('T128：CurveModifier 分包把 Flow 的实现打进去了')
      }
      if (!flow.includes('moveAlongCurve') || !flow.includes('pathOffset') || !flow.includes('spineTexture')) {
        throw new Error('T128：Flow 分包里没有 three-stdlib Flow')
      }
      if (mount.length > 20_000 || modifier.length > 30_000 || flow.length > 80_000 || body.length > 400_000) {
        throw new Error(
          `T128：分包过大 mount=${mount.length} body=${body.length} modifier=${modifier.length} flow=${flow.length}`,
        )
      }
      if (!body.includes(`./${names.indexFile}`) || !modifier.includes(`./${names.indexFile}`) || !flow.includes(`./${names.indexFile}`)) {
        throw new Error('T128：分包没有复用入口包')
      }
      bundle['assets/CurvePatrolMount.js'] = asset('assets/CurvePatrolMount.js', mount)
      bundle['assets/CurvePatrolBody.js'] = asset('assets/CurvePatrolBody.js', body)
      bundle['assets/CurveModifier.js'] = asset('assets/CurveModifier.js', modifier)
      bundle['assets/Flow.js'] = asset('assets/Flow.js', flow)
      dock.code += `\nvoid import("./CurvePatrolMount.js").then((m)=>{m.mountCurvePatrol()});\n`
    },
  }
}
