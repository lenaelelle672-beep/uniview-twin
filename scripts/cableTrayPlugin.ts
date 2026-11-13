import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的桥架接线摘掉。
 * drei shapes（Tube）不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、管子分包，以及 shapes.js 自己的分包接回。
 * shapes.js 跟着管子分包走，不进 hardGate / balancedFx。
 */
export const CABLE_TRAY_SOURCE_BLOCK = `
// T126：电缆桥架和管道。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../cable-tray/mount').then((mod) => {
  mod.mountCableTray()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/cable-tray/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/cable-tray/CableTrays.tsx', import.meta.url))
const CURVE_ENTRY = fileURLToPath(new URL('../src/cable-tray/curve.ts', import.meta.url))
const POSE_ENTRY = fileURLToPath(new URL('../src/cable-tray/pose.ts', import.meta.url))
const DREI_SHAPES = fileURLToPath(new URL('../node_modules/@react-three/drei/core/shapes.js', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS = /cable-tray|mountCableTray|CableTrays|__twinCableTray|drei\/core\/shapes/

const CLASS_SRC: Record<string, string> = {
  Box3: 'three/src/math/Box3.js',
  CatmullRomCurve3: 'three/src/extras/curves/CatmullRomCurve3.js',
  Float32BufferAttribute: 'three/src/core/BufferAttribute.js',
  Matrix4: 'three/src/math/Matrix4.js',
  Quaternion: 'three/src/math/Quaternion.js',
  Vector3: 'three/src/math/Vector3.js',
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

function addNamedThreeImports(source: string, names: Set<string>): void {
  for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g)) {
    if (match[1]) continue
    for (const part of (match[2] ?? '').split(',')) {
      const piece = part.trim()
      if (!piece || piece.startsWith('type ')) continue
      const name = piece.split(/\s+as\s+/)[0]?.trim()
      if (name) names.add(name)
    }
  }
}

function addNamespaceThreeImports(source: string, names: Set<string>): void {
  for (const match of source.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1])
  }
}

/** 管子组件按名导入的 three，加上 shapes.js 经 `THREE.` 用到的。 */
export function threeImportNames(): string[] {
  const names = new Set<string>()
  for (const file of [CURVE_ENTRY, POSE_ENTRY, LIVE_ENTRY]) {
    addNamedThreeImports(readFileSync(file, 'utf8'), names)
  }
  addNamespaceThreeImports(readFileSync(DREI_SHAPES, 'utf8'), names)
  return [...names].sort()
}

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export default React
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
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
    const src = CLASS_SRC[name]
    if (!src) throw new Error(`T126：three 缺导出 ${name}`)
    lines.push(`export { ${name} } from ${JSON.stringify(src)}`)
  }
  return `${lines.join('\n')}\n`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
  kind: 'mount' | 'live' | 'module',
): EsbuildPlugin {
  return {
    name: 'cable-tray-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/CableTrays(?:\.tsx)?$/ }, () => ({
          path: './CableTrays.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /(?:^|\/)@react-three\/drei\/core\/shapes(?:\.js)?$/ }, () => ({
          path: './shapes.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'tray-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'tray-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'tray-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'tray-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'tray-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'tray-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names.useThree)
                : args.path === 'three'
                  ? threeShim(names.indexFile, three.found, three.missing)
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
    throw new Error(`T126：桥架分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T126：桥架分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T126：${label} 语法检查失败 ${result.stderr}`)
}

export function stripCableTraySource(code: string): string {
  if (!code.includes(CABLE_TRAY_SOURCE_BLOCK)) {
    throw new Error('T126：dock 里的桥架接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(CABLE_TRAY_SOURCE_BLOCK, '')
  if (next.includes('mountCableTray') || next.includes('cable-tray')) {
    throw new Error('T126：摘完 dock 仍留着桥架接线')
  }
  return next
}

export function cableTrayAfterHash(): Plugin {
  return {
    name: 'cable-tray-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripCableTraySource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T126：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          const at = hit.index ?? 0
          this.error(`T126：桥架被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」${chunk.code.slice(Math.max(0, at - 80), at + 80)}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T126：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      let shapes = ''
      try {
        mount = scrub(await bundleEntry(MOUNT_ENTRY, 'mount', names, looked))
        live = scrub(await bundleEntry(LIVE_ENTRY, 'live', names, looked))
        shapes = scrub(await bundleEntry(DREI_SHAPES, 'module', names, looked))
        assertSyntax(mount, 'CableTrayMount')
        assertSyntax(live, 'CableTrays')
        assertSyntax(shapes, 'shapes')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T126：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./CableTrays.js') || !mount.includes('mountCableTray')) {
        this.error('T126：开关分包没有延迟加载管子')
      }
      if (mount.includes('CatmullRom') || mount.includes('tubeGeometry') || mount.includes('./shapes.js')) {
        this.error('T126：开关分包把曲线或 shapes 打进去了')
      }
      if (!live.includes('./shapes.js') || !live.includes('CableTraySpine') || !live.includes('ServiceRiser')) {
        this.error('T126：管子分包没有分开引用 shapes')
      }
      if (live.includes('useFrame') || live.includes('setFromBufferAttribute') || live.includes('InstancedMesh')) {
        this.error('T126：管子分包不该有逐帧、Shape 贴图或实例网格')
      }
      if (!shapes.includes('tube') || !shapes.includes('Geometry')) {
        this.error('T126：shapes 模块分包不对')
      }
      if (shapes.includes('WebGLRenderer') || shapes.includes('GLTFLoader') || shapes.includes('useFrame')) {
        this.error('T126：shapes 分包把 three 整包或逐帧逻辑打进来了')
      }
      const bundled = mount + live + shapes
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T126：桥架分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei["']|from["']three-stdlib["']/.test(bundled)) {
        this.error('T126：桥架分包把 three 整包或 drei 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b|transmission/.test(bundled)) {
        this.error('T126：桥架分包带了外链、HDR 或 transmission')
      }
      if (/setMatrixAt|\.instanceMatrix|new InstancedMesh/.test(mount + live)) {
        this.error('T126：桥架分包写了实例矩阵')
      }
      if (mount.length > 20_000 || live.length > 80_000 || shapes.length > 40_000) {
        this.error(`T126：桥架分包过大 mount=${mount.length} live=${live.length} shapes=${shapes.length}`)
      }
      bundle['assets/CableTrayMount.js'] = asset('assets/CableTrayMount.js', mount)
      bundle['assets/CableTrays.js'] = asset('assets/CableTrays.js', live)
      bundle['assets/shapes.js'] = asset('assets/shapes.js', shapes)
      dock.code += `\nvoid import("./CableTrayMount.js").then((m)=>{m.mountCableTray()});\n`
    },
  }
}
