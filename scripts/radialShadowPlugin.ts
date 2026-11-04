import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的落地影接线摘掉。
 * drei Shadow 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、圆斑分包，以及 Shadow 自己的分包接回。
 * 三个文件都在 dock 之后才请求，Shadow 还要等开关打开才请求，不进 hardGate / balancedFx。
 */
export const RADIAL_SHADOW_SOURCE_BLOCK = `// T120：家具/选中件径向投影阴影。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../radial-shadow/mount').then((mod) => {
  mod.mountRadialShadow()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/radial-shadow/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/radial-shadow/RadialShadows.tsx', import.meta.url))
const DREI_SHADOW = fileURLToPath(new URL('../node_modules/@react-three/drei/core/Shadow.js', import.meta.url))

/** 入口包、balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。不用裸的 Shadow，免得撞上 ContactShadows / SoftShadows。 */
const GATE_MARKERS =
  /radial-shadow|mountRadialShadow|RadialShadows|__twinRadialShadow|radialShadow|drei\/core\/Shadow/

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

/** drei Shadow.js 按名从 three 引进来的。当前是 Color 和 DoubleSide。 */
export function shadowThreeNames(): string[] {
  const source = readFileSync(DREI_SHADOW, 'utf8')
  const names = new Set<string>()
  for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g)) {
    if (match[1]) continue
    for (const part of (match[2] ?? '').split(',')) {
      const piece = part.trim()
      if (!piece || piece.startsWith('type ')) continue
      const name = piece.split(/\s+as\s+/)[0]?.trim()
      if (name) names.add(name)
    }
  }
  return [...names].sort()
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (missing.length > 0) throw new Error(`T120：入口包缺 three 导出 ${missing.join(', ')}`)
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T120：入口包没有可复用的 three 导出')
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

/** Shadow.js 用 babel helper 展开 props。内联这一小段，不把 @babel/runtime 打进分包。 */
function babelExtendsShim(): string {
  return `export default function _extends() {
  return Object.assign.apply(Object, arguments)
}
`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
  kind: 'mount' | 'live' | 'module',
): EsbuildPlugin {
  return {
    name: 'radial-shadow-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/RadialShadows(?:\.tsx)?$/ }, () => ({
          path: './RadialShadows.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /^@react-three\/drei\/core\/Shadow(?:\.js)?$/ }, () => ({
          path: './RadialShadow.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^@babel\/runtime\/helpers\/(?:esm\/)?extends(?:\.js)?$/ }, () => ({
        path: 'babel-extends',
        namespace: 'radial-shim',
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'radial-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'radial-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'radial-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'radial-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'radial-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'radial-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names.useThree)
                : args.path === 'three'
                  ? threeShim(names.indexFile, three.found, three.missing)
                  : args.path === 'store'
                    ? storeShim(names.indexFile, names.store)
                    : babelExtendsShim()
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
    throw new Error(`T120：落地影分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T120：落地影分包没有打成单个文件')
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

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T120：${label} 语法检查失败 ${result.stderr}`)
}

export function stripRadialShadowSource(code: string): string {
  if (!code.includes(RADIAL_SHADOW_SOURCE_BLOCK)) {
    throw new Error('T120：dock 里的落地影接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(RADIAL_SHADOW_SOURCE_BLOCK, '')
  if (next.includes('mountRadialShadow') || next.includes('radial-shadow')) {
    throw new Error('T120：摘完 dock 仍留着落地影接线')
  }
  return next
}

const FORBIDDEN =
  /useFrame\(|\bContactShadows\b|from["'][^"']*softShadows|core\/ContactShadows|instanceMatrix|setMatrixAt|from["']three["']|@react-three\/drei["']|@babel\/runtime/

export function radialShadowAfterHash(): Plugin {
  return {
    name: 'radial-shadow-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripRadialShadowSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T120：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          this.error(`T120：落地影被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T120：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, shadowThreeNames())
      let mount = ''
      let live = ''
      let shadow = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, 'mount', names, looked)
        live = await bundleEntry(LIVE_ENTRY, 'live', names, looked)
        shadow = await bundleEntry(DREI_SHADOW, 'module', names, looked)
        assertSyntax(mount, 'RadialShadowMount')
        assertSyntax(live, 'RadialShadows')
        assertSyntax(shadow, 'RadialShadow')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T120：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./RadialShadows.js') || !mount.includes('mountRadialShadow')) {
        this.error('T120：开关分包没有延迟加载圆斑')
      }
      if (mount.includes('createRadialGradient') || mount.includes('canvasTexture') || mount.includes('./RadialShadow.js')) {
        this.error('T120：开关分包把 drei Shadow 打进去了')
      }
      if (!live.includes('./RadialShadow.js') || !live.includes('RadialShadows')) {
        this.error('T120：圆斑分包没有分开引用 drei Shadow')
      }
      if (live.includes('createRadialGradient') || live.includes('canvasTexture')) {
        this.error('T120：圆斑分包把 drei Shadow 内联了')
      }
      if (!shadow.includes('createRadialGradient') || !shadow.includes('canvasTexture') || !shadow.includes('getStyle')) {
        this.error('T120：Shadow 模块分包不对')
      }
      if (/\buseFrame\(/.test(mount + live + shadow)) {
        this.error('T120：落地影分包出现了 useFrame')
      }
      const bundled = mount + live + shadow
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T120：落地影分包没有复用入口包')
      }
      if (FORBIDDEN.test(bundled)) {
        this.error('T120：落地影分包碰了 three 整包、drei 入口、接触阴影、软阴影或 babel runtime')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b/.test(bundled)) {
        this.error('T120：落地影分包带了外链或 HDR')
      }
      if (mount.length > 20_000 || live.length > 20_000 || shadow.length > 12_000) {
        this.error(`T120：落地影分包过大 mount=${mount.length} live=${live.length} shadow=${shadow.length}`)
      }
      bundle['assets/RadialShadowMount.js'] = asset('assets/RadialShadowMount.js', mount)
      bundle['assets/RadialShadows.js'] = asset('assets/RadialShadows.js', live)
      bundle['assets/RadialShadow.js'] = asset('assets/RadialShadow.js', shadow)
      dock.code += `\nvoid import("./RadialShadowMount.js").then((m)=>{m.mountRadialShadow()});\n`
    },
  }
}
