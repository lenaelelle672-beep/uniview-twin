import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的平面图接线摘掉。
 * drei OrthographicCamera 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和相机分包接回 dock。相机要等会话打开并且已经在单层里才请求。
 * T123：Svg 再从相机分包里动态拆出去。SVGLoader 不进相机包，也不进 vite 图。
 */
export const FLOOR_PLAN_SOURCE_BLOCK = `// T118：单层平面图俯视。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../floor-plan/mount').then((mod) => {
  mod.mountFloorPlan()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/floor-plan/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/floor-plan/FloorPlanCamera.tsx', import.meta.url))
const SVG_ENTRY = fileURLToPath(new URL('../src/floor-plan/FloorPlanSvg.tsx', import.meta.url))
const DREI_FBO = fileURLToPath(new URL('../node_modules/@react-three/drei/core/Fbo.js', import.meta.url))

/** 入口包、balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS = /floor-plan|mountFloorPlan|FloorPlanCamera|__twinSetFloorPlan|__twinFloorPlanSync|floorPlanBoot/

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

/** 相机组件按名导入的 three，加上 drei Fbo 经 `THREE.` 命名空间用到的。 */
export function threeImportNames(): string[] {
  const names = new Set<string>()
  const live = readFileSync(LIVE_ENTRY, 'utf8')
  for (const match of live.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g)) {
    if (match[1]) continue
    for (const part of (match[2] ?? '').split(',')) {
      const piece = part.trim()
      if (!piece || piece.startsWith('type ')) continue
      const name = piece.split(/\s+as\s+/)[0]?.trim()
      if (name) names.add(name)
    }
  }
  const fbo = readFileSync(DREI_FBO, 'utf8')
  for (const match of fbo.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1])
  }
  return [...names].sort()
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (missing.length > 0) throw new Error(`T118：入口包缺 three 导出 ${missing.join(', ')}`)
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T118：入口包没有可复用的 three 导出')
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}
export { ${keys.join(', ')} }
`
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

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame } from ${from}
export { useThree, useFrame }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
  externalLive: boolean,
): EsbuildPlugin {
  return {
    name: 'floor-plan-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/FloorPlanCamera(?:\.tsx)?$/ }, () => ({
          path: './FloorPlanCamera.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^\.\/FloorPlanSvg(?:\.tsx)?$/ }, () => ({
        path: './FloorPlanSvg.js',
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'plan-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'plan-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'plan-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'plan-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'plan-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'plan-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
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
  externalLive: boolean,
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
    plugins: [shimPlugin(names, three, externalLive)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T118：平面图分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T118：平面图分包没有打成单个文件')
  return file.text
}

function svgFiberShim(indexFile: string, names: GridBindings): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${names.useThree} as useThree } from ${from}
export { useThree }
const cache = new Map()
export function useLoader(LoaderCtor, url) {
  const key = String(url)
  const hit = cache.get(key)
  if (hit && typeof hit.then !== 'function') return hit
  if (!hit) {
    const loader = new LoaderCtor()
    const pending = new Promise((resolve, reject) => {
      loader.load(key, resolve, undefined, reject)
    }).then(
      (value) => {
        cache.set(key, value)
        return value
      },
      (error) => {
        cache.delete(key)
        throw error
      },
    )
    cache.set(key, pending)
    throw pending
  }
  throw hit
}
useLoader.preload = () => {}
useLoader.clear = (_loader, input) => {
  const keys = Array.isArray(input) ? input : [input]
  for (const key of keys) cache.delete(String(key))
}
`
}

function svgShimPlugin(names: GridBindings): EsbuildPlugin {
  return {
    name: 'floor-plan-svg-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'svg-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'svg-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'svg-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'svg-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : svgFiberShim(names.indexFile, names)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleSvg(names: GridBindings): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [SVG_ENTRY],
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
    plugins: [svgShimPlugin(names)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T123：Svg 分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T123：Svg 分包没有打成单个文件')
  return file.text
}

function assertSvgChunk(source: string): void {
  if (!source.includes('drei-Svg') || !source.includes('createShapes') || !source.includes('/floor-plan/floor.svg')) {
    throw new Error('T123：Svg 分包里没有 drei Svg 或本地图纸')
  }
  if (source.includes('WebGLRenderer') || source.includes('GLTFLoader') || source.includes('OrthographicCamera')) {
    throw new Error('T123：Svg 分包带进了渲染器、GLTF 或正交相机')
  }
  if (/from["']three["']|@react-three\/drei["']|jsdelivr|unpkg|githack|cdn\.jsdelivr|rawcdn/.test(source)) {
    throw new Error('T123：Svg 分包带了 three 入口、drei 桶或外链')
  }
  const urls = source.match(/https?:\/\/[^"'\\\s)]+/g) ?? []
  for (const url of urls) {
    if (!url.startsWith('http://www.w3.org/')) throw new Error(`T123：Svg 分包有外链 ${url}`)
  }
  if (source.length > 420_000) throw new Error(`T123：Svg 分包过大 ${source.length}`)
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

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T118：${label} 语法检查失败 ${result.stderr}`)
}

export function stripFloorPlanSource(code: string): string {
  if (!code.includes(FLOOR_PLAN_SOURCE_BLOCK)) {
    throw new Error('T118：dock 里的平面图接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(FLOOR_PLAN_SOURCE_BLOCK, '')
  if (next.includes('mountFloorPlan') || next.includes('floor-plan')) {
    throw new Error('T118：摘完 dock 仍留着平面图接线')
  }
  return next
}

export function floorPlanAfterHash(): Plugin {
  return {
    name: 'floor-plan-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripFloorPlanSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T118：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        if (GATE_MARKERS.test(chunk.code)) {
          this.error(`T118：平面图被打进了 vite 分包 ${chunk.fileName}`)
          return
        }
      }
      if (fx.code.includes('FloorPlan') || fx.code.includes('floor-plan') || fx.code.includes('mountFloorPlan')) {
        this.error('T118：平面图进了 balancedFx')
        return
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T118：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      let svg = ''
      try {
        ;[mount, live, svg] = await Promise.all([
          bundleEntry(MOUNT_ENTRY, true, names, looked),
          bundleEntry(LIVE_ENTRY, false, names, looked),
          bundleSvg(names),
        ])
        assertSyntax(mount, 'FloorPlanMount')
        assertSyntax(live, 'FloorPlanCamera')
        assertSyntax(svg, 'FloorPlanSvg')
        assertSvgChunk(svg)
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T118：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./FloorPlanCamera.js') || !mount.includes('mountFloorPlan')) {
        this.error('T118：开关分包没有延迟加载正交相机')
      }
      if (mount.includes('orthographicCamera') || mount.includes('WebGLRenderTarget') || mount.includes('makeDefault')) {
        this.error('T118：开关分包把 drei OrthographicCamera 打进去了')
      }
      if (!live.includes('orthographicCamera') || !live.includes('makeDefault')) {
        this.error('T118：相机分包里没有 drei OrthographicCamera')
      }
      if (!live.includes('./FloorPlanSvg.js')) {
        this.error('T123：相机分包没有延迟加载 Svg')
      }
      if (live.includes('drei-Svg') || live.includes('createShapes') || live.includes('SVGLoader')) {
        this.error('T123：相机分包把 Svg 打进去了')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T118：平面图分包没有复用入口包')
      }
      if (
        /from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei|from["']camera-controls|new CameraControls|\bCameraControls\b|setLookAt|fitToBox/.test(
          mount + live,
        )
      ) {
        this.error('T118：平面图分包把 three 整包、drei 入口或 CameraControls 打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg/.test(mount + live)) {
        this.error('T118：平面图分包带了外链')
      }
      if (mount.length > 20_000 || live.length > 40_000) {
        this.error(`T118：平面图分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/FloorPlanMount.js'] = asset('assets/FloorPlanMount.js', mount)
      bundle['assets/FloorPlanCamera.js'] = asset('assets/FloorPlanCamera.js', live)
      bundle['assets/FloorPlanSvg.js'] = asset('assets/FloorPlanSvg.js', svg)
      dock.code += `\nvoid import("./FloorPlanMount.js").then((m)=>{m.mountFloorPlan()});\n`
    },
  }
}
