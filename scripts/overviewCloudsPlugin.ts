import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { LOCAL_CLOUD_TEXTURE } from '../src/overview-clouds/plan'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的云层接线摘掉。
 * drei Cloud 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和云分包接回 dock。贴图仍要等昼间总览才请求。
 */
export const OVERVIEW_CLOUD_SOURCE_BLOCK = `// T106：总览云层。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../overview-clouds/mount').then((mod) => {
  mod.mountOverviewClouds()
})
`

const GITHACK_CLOUD =
  'https://rawcdn.githack.com/pmndrs/drei-assets/9225a9f1fbd449d9411125c2f419b843d0308c9f/cloud.png'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/overview-clouds/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/overview-clouds/OverviewClouds.tsx', import.meta.url))
const APPLY_ENTRY = fileURLToPath(new URL('../src/overview-clouds/applyCloudProps.ts', import.meta.url))

const THREE_SOURCES = [
  fileURLToPath(new URL('../node_modules/@react-three/drei/core/Cloud.js', import.meta.url)),
  fileURLToPath(new URL('../node_modules/@react-three/drei/core/Texture.js', import.meta.url)),
  fileURLToPath(new URL('../node_modules/@react-three/drei/helpers/deprecated.js', import.meta.url)),
  LIVE_ENTRY,
]

const STUB_OK = new Set(['DynamicDrawUsage', 'TextureLoader', 'SRGBColorSpace', 'MeshLambertMaterial'])

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

function threeImportNames(): string[] {
  const names = new Set<string>()
  const pattern = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g
  for (const file of THREE_SOURCES) {
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
  return [...names]
}

function textureLoaderStub(found: Record<string, string>): string {
  const colorSpace = found.SRGBColorSpace ? 'SRGBColorSpace' : `'srgb'`
  return `export class TextureLoader {
  load(url, onLoad, _onProgress, onError) {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    const texture = new Texture(image)
    texture.colorSpace = ${colorSpace}
    texture.premultiplyAlpha = false
    image.onload = () => {
      texture.needsUpdate = true
      if (onLoad) onLoad(texture)
    }
    image.onerror = () => {
      if (onError) onError(new Error('cloud texture'))
    }
    image.src = String(url)
    return texture
  }
}
`
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T106：入口包没有可复用的 three 导出')
  if (!found.Texture) throw new Error('T106：入口包没有导出 three.Texture')
  if (!found.REVISION) throw new Error('T106：入口包没有导出 three.REVISION')
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  const lines = [
    `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}`,
    `export { ${keys.join(', ')} }`,
  ]
  if (!found.MeshLambertMaterial) {
    if (!found.MeshBasicMaterial) throw new Error('T106：入口包没有 MeshBasicMaterial，无法替代 MeshLambertMaterial')
    lines.push('export { MeshBasicMaterial as MeshLambertMaterial }')
  }
  if (missing.includes('DynamicDrawUsage')) lines.push('export const DynamicDrawUsage = 35048')
  if (missing.includes('TextureLoader')) lines.push(textureLoaderStub(found))
  const unknown = missing.filter((name) => !STUB_OK.has(name))
  if (unknown.length > 0) throw new Error(`T106：three 缺导出 ${unknown.join(', ')}`)
  return lines.join('\n')
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
export const useId = React.useId
export const useContext = React.useContext
export const useImperativeHandle = React.useImperativeHandle
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const createContext = React.createContext
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
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame, ${names.extend} as extend } from ${from}
export { useThree, useFrame, extend }
const textureCache = new Map()
export function useLoader(LoaderCtor, url) {
  const key = String(LoaderCtor.name) + '\\0' + String(url)
  const hit = textureCache.get(key)
  if (hit && typeof hit.then !== 'function') return hit
  if (!hit) {
    const loader = new LoaderCtor()
    const pending = new Promise((resolve, reject) => {
      loader.load(String(url), resolve, undefined, reject)
    }).then((value) => {
      textureCache.set(key, value)
      return value
    })
    textureCache.set(key, pending)
    throw pending
  }
  throw hit
}
useLoader.preload = () => {}
useLoader.clear = () => {}
export { applyCloudProps as applyProps } from ${JSON.stringify(APPLY_ENTRY)}
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
    name: 'overview-cloud-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/OverviewClouds(?:\.tsx)?$/ }, () => ({
          path: './OverviewClouds.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'cloud-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'cloud-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'cloud-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'cloud-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'cloud-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'cloud-shim' }, (args) => {
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
    plugins: [shimPlugin(names, three, externalLive)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T106：云分包没有打成单个文件')
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

function rewriteCloudUrl(source: string): string {
  return source.split(GITHACK_CLOUD).join(LOCAL_CLOUD_TEXTURE)
}

function scrub(source: string): string {
  return source.replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '').replace(/https?:\/\/[^\s"'`\\]*/g, '')
}

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T106：${label} 语法检查失败 ${result.stderr}`)
}

export function stripOverviewCloudSource(code: string): string {
  if (!code.includes(OVERVIEW_CLOUD_SOURCE_BLOCK)) {
    throw new Error('T106：dock 里的云层接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(OVERVIEW_CLOUD_SOURCE_BLOCK, '')
  if (next.includes('mountOverviewClouds') || next.includes('overview-clouds')) {
    throw new Error('T106：摘完 dock 仍留着云层接线')
  }
  return next
}

export function overviewCloudsAfterHash(): Plugin {
  return {
    name: 'overview-clouds-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripOverviewCloudSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T106：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      const gate = `${index.code}\n${fx.code}\n${dock.code}\n${loop.code}`
      if (/overview-clouds|mountOverviewClouds|OverviewClouds|cloudOpacity|githack|textures\/clouds/.test(gate)) {
        this.error('T106：云层被打进了入口包、balancedFx、DemandLoop 或哈希前的 dock')
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T106：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      try {
        mount = scrub(rewriteCloudUrl(await bundleEntry(MOUNT_ENTRY, true, names, looked)))
        live = scrub(rewriteCloudUrl(await bundleEntry(LIVE_ENTRY, false, names, looked)))
        assertSyntax(mount, 'OverviewCloudMount')
        assertSyntax(live, 'OverviewClouds')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T106：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./OverviewClouds.js') || !mount.includes('mountOverviewClouds')) {
        this.error('T106：开关分包没有延迟加载云层')
      }
      if (mount.includes('cloudOpacity') || mount.includes('githack') || mount.includes('@react-three/drei')) {
        this.error('T106：开关分包把 drei Cloud 打进去了')
      }
      if (!live.includes(LOCAL_CLOUD_TEXTURE) || !live.includes('cloudOpacity')) {
        this.error('T106：云分包里没有本地贴图或 drei Cloud')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T106：云分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|takram/.test(mount + live)) {
        this.error('T106：云分包把 three 整包或外链库打进去了')
      }
      const blob = `${mount}\n${live}`
      const linkAt = Math.max(blob.indexOf('githack'), blob.indexOf('https://'), blob.indexOf('http://'), blob.indexOf('jsdelivr'))
      if (linkAt >= 0) {
        this.error(`T106：云分包带了外链 ${blob.slice(Math.max(0, linkAt - 80), linkAt + 120)}`)
      }
      if (mount.length > 40_000 || live.length > 120_000) {
        this.error(`T106：云分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/OverviewCloudMount.js'] = asset('assets/OverviewCloudMount.js', mount)
      bundle['assets/OverviewClouds.js'] = asset('assets/OverviewClouds.js', live)
      dock.code += `\nvoid import("./OverviewCloudMount.js").then((m)=>{m.mountOverviewClouds()});\n`
    },
  }
}
