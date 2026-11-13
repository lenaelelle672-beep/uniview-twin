import { gzipSync } from 'node:zlib'
import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的探针接线摘掉。
 * drei CubeCamera 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、探针分包，以及 CubeCamera 自己的分包接回。
 * three 的 CubeCamera / 立方体渲染目标另成小包，不进 hardGate / balancedFx。
 * 库里的默认 frames=Infinity 在打进 CubeCamera.js 之前改成 1。
 */
export const CUBE_PROBE_SOURCE_BLOCK = `// T129：近场立方体贴图探针。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../cube-probe/mount').then((mod) => {
  mod.mountCubeProbe()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/cube-probe/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/cube-probe/CubeProbe.tsx', import.meta.url))
const TARGET_ENTRY = fileURLToPath(new URL('../src/cube-probe/cubeTarget.ts', import.meta.url))
const DREI_CUBE = fileURLToPath(new URL('../node_modules/@react-three/drei/core/CubeCamera.js', import.meta.url))
const THREE_CUBE = fileURLToPath(new URL('../node_modules/three/src/cameras/CubeCamera.js', import.meta.url))
const CUBE_TEXTURE = fileURLToPath(new URL('../node_modules/three/src/textures/CubeTexture.js', import.meta.url))

/** 入口包、balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。不用裸的 CubeCamera，Preload 分包里本来就有这个词。 */
const GATE_MARKERS = /cube-probe|mountCubeProbe|__twinCubeProbe|drei\/core\/CubeCamera|CubeProbeMount/

const INDEX_KEYS = ['HalfFloatType', 'WebGLRenderTarget', 'Texture', 'Object3D', 'PerspectiveCamera', 'Box3', 'Vector3'] as const

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

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export default React
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useCallback = React.useCallback
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

function dreiThreeShim(indexFile: string, halfFloat: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${halfFloat} as HalfFloatType } from ${from}
export { HalfFloatType }
export { WebGLCubeRenderTarget } from './CubeTarget.js'
export { CubeCamera } from './ThreeCubeCamera.js'
`
}

function targetThreeShim(indexFile: string, renderTarget: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${renderTarget} as WebGLRenderTarget } from ${from}
export { WebGLRenderTarget }
export { CubeTexture } from ${JSON.stringify(CUBE_TEXTURE)}
`
}

function liveThreeShim(indexFile: string, found: Record<string, string>): string {
  const keys = ['Box3', 'Vector3']
  for (const key of keys) {
    if (!found[key]) throw new Error(`T129：入口包缺 three 导出 ${key}`)
  }
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}
export { ${keys.join(', ')} }
`
}

function requireFound(found: Record<string, string>, missing: string[]): void {
  if (missing.length > 0) throw new Error(`T129：入口包缺 three 导出 ${missing.join(', ')}`)
  for (const key of INDEX_KEYS) {
    if (!found[key]) throw new Error(`T129：入口包缺 three 导出 ${key}`)
  }
}

function shimPlugin(
  names: GridBindings,
  found: Record<string, string>,
  kind: 'mount' | 'live' | 'drei' | 'target',
): EsbuildPlugin {
  return {
    name: 'cube-probe-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^\.\/CubeTarget\.js$/ }, () => ({ path: './CubeTarget.js', external: true }))
      build.onResolve({ filter: /^\.\/ThreeCubeCamera\.js$/ }, () => ({ path: './ThreeCubeCamera.js', external: true }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/CubeProbe(?:\.tsx)?$/ }, () => ({
          path: './CubeProbe.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /(?:^|\/)@react-three\/drei\/core\/CubeCamera(?:\.js)?$/ }, () => ({
          path: './CubeCamera.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'cube-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'cube-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'cube-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'cube-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'cube-shim' }))
      if (kind === 'target') {
        build.onLoad({ filter: /\/textures\/CubeTexture\.js$/ }, () => {
          const raw = readFileSync(CUBE_TEXTURE, 'utf8')
          const contents = raw
            .replace(
              "import { Texture } from './Texture.js';",
              `import { ${found.Texture} as Texture } from ${JSON.stringify(`./${names.indexFile}`)};`,
            )
            .replace("import { CubeReflectionMapping } from '../constants.js';", 'const CubeReflectionMapping = 301;')
          if (contents.includes("from './Texture.js'") || contents.includes('constants.js')) {
            throw new Error('T129：CubeTexture 还有未改写的依赖')
          }
          return { contents, loader: 'js', resolveDir: dirname(CUBE_TEXTURE) }
        })
      }
      build.onLoad({ filter: /.*/, namespace: 'cube-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? kind === 'drei'
                    ? dreiThreeShim(names.indexFile, found.HalfFloatType ?? '')
                    : kind === 'target'
                      ? targetThreeShim(names.indexFile, found.WebGLRenderTarget ?? '')
                      : kind === 'live'
                        ? liveThreeShim(names.indexFile, found)
                        : 'export {}\n'
                  : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

function threeCubePlugin(names: GridBindings, found: Record<string, string>): EsbuildPlugin {
  return {
    name: 'three-cube-camera',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onLoad({ filter: /\/cameras\/CubeCamera\.js$/ }, () => {
        let contents = readFileSync(THREE_CUBE, 'utf8')
        const next = contents
          .replace(
            "import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from '../constants.js';",
            'const WebGLCoordinateSystem = 2000;\nconst WebGPUCoordinateSystem = 2001;',
          )
          .replace(
            "import { Object3D } from '../core/Object3D.js';",
            `import { ${found.Object3D} as Object3D } from ${JSON.stringify(`./${names.indexFile}`)};`,
          )
          .replace(
            "import { PerspectiveCamera } from './PerspectiveCamera.js';",
            `import { ${found.PerspectiveCamera} as PerspectiveCamera } from ${JSON.stringify(`./${names.indexFile}`)};`,
          )
        if (next === contents || next.includes('constants.js') || next.includes('./PerspectiveCamera.js')) {
          throw new Error('T129：three CubeCamera 的依赖没有改写干净')
        }
        contents = next
        return { contents, loader: 'js', resolveDir: dirname(THREE_CUBE) }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  kind: 'mount' | 'live' | 'target',
  names: GridBindings,
  found: Record<string, string>,
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
    plugins: [shimPlugin(names, found, kind)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T129：探针分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T129：探针分包没有打成单个文件')
  return file.text
}

function dreiSource(): string {
  const raw = readFileSync(DREI_CUBE, 'utf8')
  if (!raw.includes('frames = Infinity') || !raw.includes('(frames === Infinity || count < frames)')) {
    throw new Error('T129：drei CubeCamera 没有默认连续烘焙，不能改写成烘一次')
  }
  const next = raw
    .replace('frames = Infinity', 'frames = 1')
    .replace('(frames === Infinity || count < frames)', '(count < frames && Number.isFinite(frames))')
  if (next.includes('Infinity')) throw new Error('T129：drei CubeCamera 改写后仍有 Infinity')
  return next
}

async function bundleDrei(names: GridBindings, found: Record<string, string>): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    stdin: {
      contents: dreiSource(),
      sourcefile: 'CubeCamera.js',
      loader: 'js',
      resolveDir: dirname(DREI_CUBE),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
    plugins: [shimPlugin(names, found, 'drei')],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T129：CubeCamera 分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T129：CubeCamera 分包没有打成单个文件')
  return file.text
}

async function bundleThreeCube(names: GridBindings, found: Record<string, string>): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [THREE_CUBE],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    charset: 'utf8',
    write: false,
    logLevel: 'silent',
    plugins: [threeCubePlugin(names, found)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T129：three CubeCamera 分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T129：three CubeCamera 分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T129：${label} 语法检查失败 ${result.stderr}`)
}

function gzip9(source: string): number {
  return gzipSync(Buffer.from(source), { level: 9 }).length
}

export function stripCubeProbeSource(code: string): string {
  if (!code.includes(CUBE_PROBE_SOURCE_BLOCK)) {
    throw new Error('T129：dock 里的探针接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(CUBE_PROBE_SOURCE_BLOCK, '')
  if (next.includes('mountCubeProbe') || next.includes('cube-probe')) {
    throw new Error('T129：摘完 dock 仍留着探针接线')
  }
  return next
}

export function cubeProbeAfterHash(): Plugin {
  return {
    name: 'cube-probe-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripCubeProbeSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T129：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          this.error(`T129：探针被打进了 ${chunk.fileName}「${hit[0]}」`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T129：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, INDEX_KEYS)
      let mount = ''
      let live = ''
      let cube = ''
      let threeCube = ''
      let target = ''
      try {
        requireFound(looked.found, looked.missing)
        mount = scrub(await bundleEntry(MOUNT_ENTRY, 'mount', names, looked.found))
        live = scrub(await bundleEntry(LIVE_ENTRY, 'live', names, looked.found))
        cube = scrub(await bundleDrei(names, looked.found))
        threeCube = scrub(await bundleThreeCube(names, looked.found))
        target = scrub(await bundleEntry(TARGET_ENTRY, 'target', names, looked.found))
        assertSyntax(mount, 'CubeProbeMount')
        assertSyntax(live, 'CubeProbe')
        assertSyntax(cube, 'CubeCamera')
        assertSyntax(threeCube, 'ThreeCubeCamera')
        assertSyntax(target, 'CubeTarget')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T129：分包失败 ${error}`)
        return
      }
      const cubeGzip = gzip9(cube)
      if (!mount.includes('./CubeProbe.js') || !mount.includes('mountCubeProbe')) {
        this.error('T129：开关分包没有延迟加载探针')
        return
      }
      if (mount.includes('CubeCamera') || mount.includes('WebGLCubeRenderTarget') || mount.includes('useFrame')) {
        this.error('T129：开关分包把 CubeCamera 打进去了')
        return
      }
      if (!live.includes('./CubeCamera.js') || !/frames:\s*1\b/.test(live)) {
        this.error('T129：探针分包没有 frames:1 的 CubeCamera')
        return
      }
      if (live.includes('Infinity') || live.includes('WebGLCubeRenderTarget') || live.includes('updateCoordinateSystem')) {
        this.error('T129：探针分包把 CubeCamera 的实现内联了')
        return
      }
      if (!cube.includes('./CubeTarget.js') || !cube.includes('./ThreeCubeCamera.js') || !cube.includes('useCubeCamera')) {
        this.error('T129：CubeCamera.js 没有分开引用立方体目标和 three 相机')
        return
      }
      if (cube.includes('Infinity') || cube.includes('updateCoordinateSystem') || cube.includes('fromEquirectangular')) {
        this.error('T129：CubeCamera.js 仍是连续烘焙，或把 three 的相机实现打进来了')
        return
      }
      if (cubeGzip > 2048) {
        this.error(`T129：CubeCamera.js gzip ${cubeGzip}，three 实现漏进了这个包`)
        return
      }
      if (!threeCube.includes('updateCoordinateSystem') || !threeCube.includes(`./${names.indexFile}`)) {
        this.error('T129：ThreeCubeCamera 分包不对')
        return
      }
      if (!target.includes('isWebGLCubeRenderTarget') || !target.includes('isCubeTexture') || !target.includes(`./${names.indexFile}`)) {
        this.error('T129：CubeTarget 分包不对')
        return
      }
      const bundled = mount + live + cube + threeCube + target
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei["']|from["']three-stdlib["']/.test(bundled)) {
        this.error('T129：探针分包把 three 整包或 drei 入口打进去了')
        return
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b|Reflector|transmission/.test(bundled)) {
        this.error('T129：探针分包带了外链、HDR、Reflector 或 transmission')
        return
      }
      if (mount.length > 20_000 || live.length > 24_000 || cube.length > 8_000 || threeCube.length > 20_000 || target.length > 16_000) {
        this.error(
          `T129：探针分包过大 mount=${mount.length} live=${live.length} cube=${cube.length} three=${threeCube.length} target=${target.length}`,
        )
        return
      }
      bundle['assets/CubeProbeMount.js'] = asset('assets/CubeProbeMount.js', mount)
      bundle['assets/CubeProbe.js'] = asset('assets/CubeProbe.js', live)
      bundle['assets/CubeCamera.js'] = asset('assets/CubeCamera.js', cube)
      bundle['assets/ThreeCubeCamera.js'] = asset('assets/ThreeCubeCamera.js', threeCube)
      bundle['assets/CubeTarget.js'] = asset('assets/CubeTarget.js', target)
      dock.code += `\nvoid import("./CubeProbeMount.js").then((m)=>{m.mountCubeProbe()});\n`
    },
  }
}
