import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的室内盒投影接线摘掉。
 * useBoxProjectedEnv 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、房间分包，以及钩子自己的分包接回。
 * 钩子还要等进入单层房间才请求。不进 hardGate / balancedFx。
 */
export const BOX_ENV_SOURCE_BLOCK = `
// T127：室内盒投影环境。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../box-projected-env/mount').then((mod) => {
  mod.mountBoxProjectedEnv()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/box-projected-env/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/box-projected-env/IndoorBoxEnv.tsx', import.meta.url))
const DREI_HOOK = fileURLToPath(
  new URL('../node_modules/@react-three/drei/core/useBoxProjectedEnv.js', import.meta.url),
)
const CHUNK_FILE = fileURLToPath(
  new URL(
    '../node_modules/three/src/renderers/shaders/ShaderChunk/envmap_physical_pars_fragment.glsl.js',
    import.meta.url,
  ),
)
const BOX3_SRC = fileURLToPath(new URL('../node_modules/three/src/math/Box3.js', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS =
  /useBoxProjectedEnv|box-projected-env|mountBoxProjectedEnv|IndoorBoxEnv|BOX_PROJECTED_ENV_MAP|parallaxCorrectNormal/

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

/** 房间分包用 Box3，钩子用 Vector3。ShaderChunk 不从入口包拿，只带那一段物理环境光。 */
export function threeImportNames(): string[] {
  return ['Box3', 'Vector3']
}

function reactShim(indexFile: string, react: string, kind: 'mount' | 'live' | 'hook'): string {
  const from = JSON.stringify(`./${indexFile}`)
  const base = `import { ${react} as React } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const createElement = React.createElement
export const Fragment = React.Fragment
`
  if (kind === 'hook') {
    return `import { ${react} as React } from ${from}
export const useState = React.useState
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useLayoutEffect = React.useLayoutEffect
`
  }
  return base
}

function jsxShim(indexFile: string, react: string, jsx: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${jsx} as runtime, ${react} as React } from ${from}
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = React.Fragment
`
}

function fiberShim(indexFile: string, useThree: string, kind: 'live' | 'hook'): string {
  if (kind === 'hook') {
    return `export function applyProps(object, props) {
  for (const key of Object.keys(props)) {
    const value = props[key]
    if (value == null) continue
    const target = object[key]
    if (!target || typeof target.set !== 'function') {
      object[key] = value
      continue
    }
    if (Array.isArray(value)) {
      target.set(value[0], value[1], value[2])
      continue
    }
    if (typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number') {
      target.set(value.x, value.y, value.z)
    }
  }
}
`
  }
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

function threeShim(
  indexFile: string,
  found: Record<string, string>,
  kind: 'live' | 'hook',
): string {
  const from = JSON.stringify(`./${indexFile}`)
  if (kind === 'hook') {
    if (!found.Vector3) throw new Error('T127：入口包没有 Vector3')
    return `import { ${found.Vector3} as Vector3 } from ${from}
import envmap_physical_pars_fragment from ${JSON.stringify(CHUNK_FILE)}
export { Vector3 }
export const ShaderChunk = { envmap_physical_pars_fragment }
`
  }
  if (found.Box3) {
    return `import { ${found.Box3} as Box3 } from ${from}
export { Box3 }
`
  }
  return `export { Box3 } from ${JSON.stringify(BOX3_SRC)}
`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string> },
  kind: 'mount' | 'live' | 'hook',
): EsbuildPlugin {
  return {
    name: 'box-env-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/IndoorBoxEnv(?:\.tsx)?$/ }, () => ({
          path: './IndoorBoxEnv.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /useBoxProjectedEnv(?:\.js)?$/ }, () => ({
          path: './useBoxProjectedEnv.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'box-env-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'box-env-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'box-env-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'box-env-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'box-env-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'box-env-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react, kind)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names.useThree, kind === 'hook' ? 'hook' : 'live')
                : args.path === 'three'
                  ? threeShim(names.indexFile, three.found, kind === 'hook' ? 'hook' : 'live')
                  : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  kind: 'mount' | 'live' | 'hook',
  names: GridBindings,
  three: { found: Record<string, string> },
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
    throw new Error(`T127：盒投影分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T127：盒投影分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T127：${label} 语法检查失败 ${result.stderr}`)
}

export function stripBoxEnvSource(code: string): string {
  if (!code.includes(BOX_ENV_SOURCE_BLOCK)) {
    throw new Error('T127：dock 里的盒投影接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(BOX_ENV_SOURCE_BLOCK, '')
  if (next.includes('mountBoxProjectedEnv') || next.includes('box-projected-env') || next.includes('useBoxProjectedEnv')) {
    throw new Error('T127：摘完 dock 仍留着盒投影接线')
  }
  return next
}

export function boxProjectedEnvAfterHash(): Plugin {
  return {
    name: 'box-projected-env-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripBoxEnvSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T127：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          const at = hit.index ?? 0
          this.error(
            `T127：盒投影被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」${chunk.code.slice(Math.max(0, at - 80), at + 80)}`,
          )
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T127：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      let hook = ''
      try {
        mount = scrub(await bundleEntry(MOUNT_ENTRY, 'mount', names, looked))
        live = scrub(await bundleEntry(LIVE_ENTRY, 'live', names, looked))
        hook = scrub(await bundleEntry(DREI_HOOK, 'hook', names, looked))
        assertSyntax(mount, 'BoxEnvMount')
        assertSyntax(live, 'IndoorBoxEnv')
        assertSyntax(hook, 'useBoxProjectedEnv')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T127：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./IndoorBoxEnv.js') || !mount.includes('mountBoxProjectedEnv')) {
        this.error('T127：开关分包没有延迟加载房间')
      }
      if (/parallaxCorrectNormal|BOX_PROJECTED_ENV_MAP|envmap_physical_pars_fragment|\.\/useBoxProjectedEnv\.js/.test(mount)) {
        this.error('T127：开关分包把钩子打进去了')
      }
      if (!live.includes('./useBoxProjectedEnv.js') || !live.includes('FloorInterior') || !live.includes('FloorSlab')) {
        this.error('T127：房间分包没有分开引用钩子')
      }
      if (/envmap_physical_pars_fragment|getIBLIrradiance|vec3 nDir/.test(live)) {
        this.error('T127：房间分包把钩子内联了')
      }
      if (!hook.includes('BOX_PROJECTED_ENV_MAP') || !hook.includes('parallaxCorrectNormal') || !hook.includes('envMapPosition')) {
        this.error('T127：useBoxProjectedEnv 模块分包不对')
      }
      if (/useFrame\(/.test(mount + live + hook)) {
        this.error('T127：盒投影分包出现了 useFrame')
      }
      const bundled = mount + live + hook
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T127：盒投影分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei["']|drei\/core\/Environment|Reflector|MeshTransmission/.test(bundled)) {
        this.error('T127：盒投影分包把 three 整包、Environment、Reflector 或 transmission 打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|HDRLoader|loadAsync\(/.test(bundled)) {
        this.error('T127：盒投影分包带了外链或自己的 HDR 加载')
      }
      if (/\.hdr/.test(hook)) {
        this.error('T127：钩子分包不应该带 HDR 路径')
      }
      if (mount.length > 24_000 || live.length > 28_000 || hook.length > 40_000) {
        this.error(`T127：盒投影分包过大 mount=${mount.length} live=${live.length} hook=${hook.length}`)
      }
      bundle['assets/BoxEnvMount.js'] = asset('assets/BoxEnvMount.js', mount)
      bundle['assets/IndoorBoxEnv.js'] = asset('assets/IndoorBoxEnv.js', live)
      bundle['assets/useBoxProjectedEnv.js'] = asset('assets/useBoxProjectedEnv.js', hook)
      dock.code += `\nvoid import("./BoxEnvMount.js").then((m)=>{m.mountBoxProjectedEnv()});\n`
    },
  }
}
