import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的圆角接线摘掉。
 * drei RoundedBox 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、载体分包，以及 RoundedBox 自己的分包接回。
 * toCreasedNormals 跟着 RoundedBox 分包走，不进 hardGate / balancedFx。
 */
export const ROUNDED_BOX_SOURCE_BLOCK = `
// T122：圆角展台、设备基座和简易道具。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../rounded-box/mount').then((mod) => {
  mod.mountRoundedBox()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/rounded-box/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/rounded-box/RoundedCarriers.tsx', import.meta.url))
const POSE_ENTRY = fileURLToPath(new URL('../src/rounded-box/pose.ts', import.meta.url))
const DREI_ROUNDED = fileURLToPath(new URL('../node_modules/@react-three/drei/core/RoundedBox.js', import.meta.url))
const CREASED = fileURLToPath(new URL('../node_modules/three-stdlib/utils/BufferGeometryUtils.js', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS = /rounded-box|mountRoundedBox|RoundedCarriers|__twinRoundedBox|drei\/core\/RoundedBox/

const CLASS_SRC: Record<string, string> = {
  Shape: 'three/src/extras/core/Shape.js',
  Vector3: 'three/src/math/Vector3.js',
  Quaternion: 'three/src/math/Quaternion.js',
  Matrix4: 'three/src/math/Matrix4.js',
  BufferGeometry: 'three/src/core/BufferGeometry.js',
  BufferAttribute: 'three/src/core/BufferAttribute.js',
  Float32BufferAttribute: 'three/src/core/BufferAttribute.js',
  InterleavedBuffer: 'three/src/core/InterleavedBuffer.js',
  InterleavedBufferAttribute: 'three/src/core/InterleavedBufferAttribute.js',
}

const DRAW_STUB: Record<string, string> = {
  TrianglesDrawMode: '0',
  TriangleStripDrawMode: '1',
  TriangleFanDrawMode: '2',
}

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

/** drei、折痕工具和落点模块从 three 按名导入的合集。 */
export function threeImportNames(): string[] {
  const names = new Set<string>([...Object.keys(CLASS_SRC), ...Object.keys(DRAW_STUB)])
  const pattern = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g
  for (const file of [DREI_ROUNDED, CREASED, POSE_ENTRY, LIVE_ENTRY]) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      if (match[1]) continue
      for (const part of (match[2] ?? '').split(',')) {
        const piece = part.trim()
        if (!piece || piece.startsWith('type ')) continue
        const name = piece.split(/\s+as\s+/)[0]?.trim()
        if (name) names.add(name)
      }
    }
  }
  return [...names].sort()
}

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export default React
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useImperativeHandle = React.useImperativeHandle
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const Fragment = React.Fragment
export const Suspense = React.Suspense
export const version = React.version
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

function fiberShim(indexFile: string, useThree: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${useThree} as useThree } from ${from}
export { useThree }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  const lines: string[] = []
  const keys = Object.keys(found)
  if (keys.length > 0) {
    const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
    lines.push(`import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}`)
    lines.push(`export { ${keys.join(', ')} }`)
  }
  for (const name of missing) {
    const stub = DRAW_STUB[name]
    if (stub) {
      lines.push(`export const ${name} = ${stub}`)
      continue
    }
    const src = CLASS_SRC[name]
    if (!src) throw new Error(`T122：three 缺导出 ${name}`)
    lines.push(`export { ${name} } from ${JSON.stringify(src)}`)
  }
  return `${lines.join('\n')}\n`
}

function stdlibShim(): string {
  return `export { toCreasedNormals } from ${JSON.stringify(CREASED)}\n`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
  kind: 'mount' | 'live' | 'module',
): EsbuildPlugin {
  return {
    name: 'rounded-box-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/RoundedCarriers(?:\.tsx)?$/ }, () => ({
          path: './RoundedCarriers.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /(?:^|\/)@react-three\/drei\/core\/RoundedBox(?:\.js)?$/ }, () => ({
          path: './RoundedBox.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'rounded-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'rounded-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'rounded-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'rounded-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: 'stdlib', namespace: 'rounded-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'rounded-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'rounded-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names.useThree)
                : args.path === 'three'
                  ? threeShim(names.indexFile, three.found, three.missing)
                  : args.path === 'stdlib'
                    ? stdlibShim()
                    : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  kind: 'mount' | 'live' | 'module',
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
): Promise<string> {
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
    plugins: [shimPlugin(names, three, kind)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T122：圆角分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T122：圆角分包没有打成单个文件')
  return file.text
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

function scrub(source: string): string {
  return source.replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '').replace(/https?:\/\/[^\s"'`\\]*/g, '')
}

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T122：${label} 语法检查失败 ${result.stderr}`)
}

export function stripRoundedBoxSource(code: string): string {
  if (!code.includes(ROUNDED_BOX_SOURCE_BLOCK)) {
    throw new Error('T122：dock 里的圆角接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(ROUNDED_BOX_SOURCE_BLOCK, '')
  if (next.includes('mountRoundedBox') || next.includes('rounded-box')) {
    throw new Error('T122：摘完 dock 仍留着圆角接线')
  }
  return next
}

export function roundedBoxAfterHash(): Plugin {
  return {
    name: 'rounded-box-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripRoundedBoxSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T122：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          const at = hit.index ?? 0
          this.error(`T122：圆角被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」${chunk.code.slice(Math.max(0, at - 80), at + 80)}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T122：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      let rounded = ''
      try {
        mount = scrub(await bundleEntry(MOUNT_ENTRY, 'mount', names, looked))
        live = scrub(await bundleEntry(LIVE_ENTRY, 'live', names, looked))
        rounded = scrub(await bundleEntry(DREI_ROUNDED, 'module', names, looked))
        assertSyntax(mount, 'RoundedBoxMount')
        assertSyntax(live, 'RoundedCarriers')
        assertSyntax(rounded, 'RoundedBox')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T122：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./RoundedCarriers.js') || !mount.includes('mountRoundedBox')) {
        this.error('T122：开关分包没有延迟加载载体')
      }
      if (mount.includes('absarc') || mount.includes('extrudeGeometry') || mount.includes('1e-10')) {
        this.error('T122：开关分包把 RoundedBox 打进去了')
      }
      if (!live.includes('./RoundedBox.js') || !live.includes('RoundedPlinth') || !live.includes('RoundedDeviceBase')) {
        this.error('T122：载体分包没有分开引用 RoundedBox')
      }
      if (live.includes('absarc') || live.includes('extrudeGeometry') || live.includes('1e-10')) {
        this.error('T122：载体分包把 drei RoundedBox 内联了')
      }
      if (!rounded.includes('absarc') || !rounded.includes('extrudeGeometry') || !rounded.includes('1e-10')) {
        this.error('T122：RoundedBox 模块分包不对')
      }
      if (rounded.includes('mergeBufferGeometries') || rounded.includes('GLTFLoader') || rounded.includes('DecalGeometry')) {
        this.error('T122：RoundedBox 分包把 three-stdlib 整包打进来了')
      }
      const bundled = mount + live + rounded
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T122：圆角分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei["']|from["']three-stdlib["']/.test(bundled)) {
        this.error('T122：圆角分包把 three 整包或 drei 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b|transmission/.test(bundled)) {
        this.error('T122：圆角分包带了外链、HDR 或 transmission')
      }
      if (/setMatrixAt|\.instanceMatrix|new InstancedMesh/.test(mount + live)) {
        this.error('T122：圆角分包写了实例矩阵')
      }
      if (mount.length > 20_000 || live.length > 24_000 || rounded.length > 80_000) {
        this.error(`T122：圆角分包过大 mount=${mount.length} live=${live.length} rounded=${rounded.length}`)
      }
      bundle['assets/RoundedBoxMount.js'] = asset('assets/RoundedBoxMount.js', mount)
      bundle['assets/RoundedCarriers.js'] = asset('assets/RoundedCarriers.js', live)
      bundle['assets/RoundedBox.js'] = asset('assets/RoundedBox.js', rounded)
      dock.code += `\nvoid import("./RoundedBoxMount.js").then((m)=>{m.mountRoundedBox()});\n`
    },
  }
}
