import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的 Kenney 接线摘掉。
 * useGLTF 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和桌椅分包接回 dock。GLB 仍要等单层才请求。
 */
export const KENNEY_SOURCE_BLOCK = `// T102：室内工位 Kenney CC0 桌椅。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../kenney-furniture/mount').then((mod) => {
  mod.mountKenneyFurniture()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/kenney-furniture/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/kenney-furniture/KenneyStations.tsx', import.meta.url))

const THREE_SOURCES = [
  fileURLToPath(new URL('../node_modules/three/examples/jsm/loaders/GLTFLoader.js', import.meta.url)),
  fileURLToPath(new URL('../node_modules/three/examples/jsm/utils/SkeletonUtils.js', import.meta.url)),
  fileURLToPath(new URL('../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', import.meta.url)),
  LIVE_ENTRY,
]

const MUST_EXPORT = [
  'Box3',
  'BufferAttribute',
  'BufferGeometry',
  'Color',
  'ColorManagement',
  'Float32BufferAttribute',
  'Group',
  'InstancedBufferAttribute',
  'InstancedMesh',
  'Material',
  'MathUtils',
  'Matrix4',
  'Mesh',
  'MeshBasicMaterial',
  'MeshStandardMaterial',
  'Object3D',
  'Quaternion',
  'Sphere',
  'Texture',
  'Vector2',
  'Vector3',
] as const

const DRAW_CONSTS: Record<string, string> = {
  TrianglesDrawMode: '0',
  TriangleStripDrawMode: '1',
  TriangleFanDrawMode: '2',
  InterpolateDiscrete: '2300',
  InterpolateLinear: '2301',
  FrontSide: '0',
  BackSide: '1',
  DoubleSide: '2',
  RepeatWrapping: '1000',
  ClampToEdgeWrapping: '1001',
  MirroredRepeatWrapping: '1002',
  NearestFilter: '1003',
  NearestMipmapNearestFilter: '1004',
  NearestMipmapLinearFilter: '1005',
  LinearFilter: '1006',
  LinearMipmapNearestFilter: '1007',
  LinearMipmapLinearFilter: '1008',
  SRGBColorSpace: `'srgb'`,
  LinearSRGBColorSpace: `'srgb-linear'`,
}

const STUB_OK = new Set([
  'AnimationClip',
  'AnimationMixer',
  'Bone',
  'DirectionalLight',
  'InterleavedBuffer',
  'InterleavedBufferAttribute',
  'Interpolant',
  'Line',
  'LineBasicMaterial',
  'LineLoop',
  'LineSegments',
  'MeshPhysicalMaterial',
  'NumberKeyframeTrack',
  'OrthographicCamera',
  'PerspectiveCamera',
  'PointLight',
  'Points',
  'PointsMaterial',
  'PropertyBinding',
  'QuaternionKeyframeTrack',
  'Skeleton',
  'SkeletonHelper',
  'SkinnedMesh',
  'SpotLight',
  'VectorKeyframeTrack',
])

const LOADER_STUB = `
function kenneyManager() {
  const controller = typeof AbortController === 'function' ? new AbortController() : { signal: undefined }
  return {
    itemStart() {},
    itemEnd() {},
    itemError() {},
    getHandler() { return null },
    resolveURL(url) { return url },
    abortController: controller,
  }
}
export class Loader {
  constructor(manager) {
    this.manager = manager || kenneyManager()
    this.crossOrigin = 'anonymous'
    this.withCredentials = false
    this.path = ''
    this.resourcePath = ''
    this.requestHeader = {}
  }
  load() {}
  setCrossOrigin(value) { this.crossOrigin = value; return this }
  setWithCredentials(value) { this.withCredentials = value; return this }
  setPath(value) { this.path = value; return this }
  setResourcePath(value) { this.resourcePath = value; return this }
  setRequestHeader(value) { this.requestHeader = value; return this }
}
`

const LOADER_UTILS_STUB = `
export class LoaderUtils {
  static extractUrlBase(url) {
    const index = url.lastIndexOf('/')
    if (index === -1) return './'
    return url.slice(0, index + 1)
  }
  static resolveURL(url, path) {
    if (typeof url !== 'string' || url === '') return ''
    if (url.charAt(0) === '/') return url
    if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return url
    return (path || '') + url
  }
}
`

const FILE_LOADER_STUB = `
export class FileLoader extends Loader {
  constructor(manager) {
    super(manager)
    this.responseType = ''
    this.mimeType = ''
  }
  setResponseType(value) { this.responseType = value; return this }
  setMimeType(value) { this.mimeType = value; return this }
  load(url, onLoad, onProgress, onError) {
    const full = (this.path || '') + url
    const resolved = this.manager && typeof this.manager.resolveURL === 'function' ? this.manager.resolveURL(full) : full
    fetch(resolved).then((response) => {
      if (!response.ok) throw new Error('Kenney GLB')
      return this.responseType === 'arraybuffer' ? response.arrayBuffer() : response.text()
    }).then((data) => {
      if (onLoad) onLoad(data)
    }).catch((error) => {
      if (onError) onError(error)
    })
  }
}
`

const TEXTURE_STUB = `
export class __NAME__ extends Loader {
  constructor(manager) { super(manager) }
  load() { return null }
  setOptions() { return this }
}
`

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

function emitStubs(missing: string[]): string {
  const rest = new Set(missing)
  let out = ''
  const take = (name: string) => {
    if (!rest.has(name)) return false
    rest.delete(name)
    return true
  }
  if (take('Loader')) out += LOADER_STUB
  if (take('LoaderUtils')) out += LOADER_UTILS_STUB
  if (take('FileLoader')) out += FILE_LOADER_STUB
  if (take('TextureLoader')) out += TEXTURE_STUB.replaceAll('__NAME__', 'TextureLoader')
  if (take('ImageBitmapLoader')) out += TEXTURE_STUB.replaceAll('__NAME__', 'ImageBitmapLoader')
  const unknown: string[] = []
  for (const name of rest) {
    const value = DRAW_CONSTS[name]
    if (value) {
      out += `export const ${name} = ${value}\n`
      continue
    }
    if (STUB_OK.has(name)) {
      out += `export class ${name} {}\n`
      continue
    }
    unknown.push(name)
  }
  if (unknown.length > 0) throw new Error(`T102：three 缺导出 ${unknown.join(', ')}`)
  return out
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T102：入口包没有可复用的 three 导出')
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}
export { ${keys.join(', ')} }
${emitStubs(missing)}
`
}

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const createElement = React.createElement
export const Fragment = React.Fragment
export const Suspense = React.Suspense
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
  return `import { ${names.useThree} as useThree } from ${from}
const cache = new Map()
const inflight = new Map()
export function useLoader(LoaderCtor, url, extensions) {
  const key = String(url)
  if (cache.has(key)) return cache.get(key)
  let pending = inflight.get(key)
  if (!pending) {
    const loader = new LoaderCtor()
    if (typeof extensions === 'function') extensions(loader)
    pending = new Promise((resolve, reject) => {
      loader.load(key, resolve, undefined, reject)
    }).then((gltf) => {
      cache.set(key, gltf)
      inflight.delete(key)
      return gltf
    })
    inflight.set(key, pending)
  }
  throw pending
}
useLoader.preload = () => {}
useLoader.clear = (_loader, url) => {
  const key = String(url)
  cache.delete(key)
  inflight.delete(key)
}
export { useThree }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function stdlibShim(): string {
  return `export { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
export class DRACOLoader {
  setDecoderPath() { return this }
  setDecoderConfig() { return this }
  preload() { return this }
  dispose() {}
}
export function MeshoptDecoder() {
  return { ready: Promise.resolve() }
}
export const SkeletonUtils = { clone(source) { return source } }
`
}

function shimPlugin(names: GridBindings, three: { found: Record<string, string>; missing: string[] }, externalLive: boolean): EsbuildPlugin {
  return {
    name: 'kenney-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/KenneyStations(?:\.tsx)?$/ }, () => ({
          path: './KenneyStations.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^\.\/Clone\.js$/ }, () => ({
        path: 'clone-stub',
        namespace: 'kenney-shim',
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'kenney-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'kenney-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'kenney-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'kenney-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: 'stdlib', namespace: 'kenney-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'kenney-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'kenney-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? threeShim(names.indexFile, three.found, three.missing)
                  : args.path === 'stdlib'
                    ? stdlibShim()
                    : args.path === 'clone-stub'
                      ? 'export function Clone() { return null }\n'
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
  if (!file || built.outputFiles.length !== 1) throw new Error('T102：Kenney 分包没有打成单个文件')
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
  if (result.status !== 0) {
    throw new Error(`T102：${label} 语法检查失败 ${result.stderr}`)
  }
}

export function kenneyFurnitureAfterHash(): Plugin {
  return {
    name: 'kenney-furniture-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(KENNEY_SOURCE_BLOCK)) {
        this.error('T102：dock 里的 Kenney 接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(KENNEY_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T102：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      const gate = `${index.code}\n${fx.code}\n${dock.code}\n${loop.code}`
      if (/kenney-furniture|mountKenneyFurniture|useGLTF|chairDesk|KenneyMount|KenneyStations/.test(gate)) {
        this.error('T102：Kenney 被打进了入口包、balancedFx、DemandLoop 或哈希前的 dock')
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T102：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const wanted = threeImportNames()
      const looked = lookupThreeExports(index.code, wanted)
      for (const key of MUST_EXPORT) {
        if (!looked.found[key]) {
          this.error(`T102：入口包没有导出 three.${key}`)
          return
        }
      }
      let mount = ''
      let live = ''
      try {
        mount = scrub(await bundleEntry(MOUNT_ENTRY, true, names, looked))
        live = scrub(await bundleEntry(LIVE_ENTRY, false, names, looked))
        assertSyntax(mount, 'KenneyMount')
        assertSyntax(live, 'KenneyStations')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T102：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./KenneyStations.js') || !mount.includes('mountKenneyFurniture')) {
        this.error('T102：开关分包没有延迟加载桌椅')
      }
      if (/GLTFLoader|useGLTF\(|three\/examples/.test(mount)) {
        this.error('T102：开关分包把 GLTFLoader 打进去了')
      }
      if (!live.includes('/models/kenney/desk.glb') || !live.includes('/models/kenney/chairDesk.glb')) {
        this.error('T102：桌椅分包里没有本地 GLB')
      }
      if (!live.includes('GLTFLoader')) {
        this.error('T102：桌椅分包里没有 GLTFLoader')
      }
      if (live.includes('WebGLRenderer') || mount.includes('WebGLRenderer')) {
        this.error('T102：Kenney 分包把 three 整包打进去了')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T102：Kenney 分包没有复用入口包')
      }
      const blob = `${live}\n${mount}`
      const linkAt = blob.indexOf('https://')
      if (linkAt >= 0 || blob.includes('gstatic') || blob.includes('jsdelivr') || blob.includes('poly.pizza')) {
        this.error(`T102：Kenney 分包带了外链 ${blob.slice(Math.max(0, linkAt - 40), linkAt + 80)}`)
      }
      if (mount.length > 80_000 || live.length > 600_000) {
        this.error(`T102：Kenney 分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/KenneyMount.js'] = asset('assets/KenneyMount.js', mount)
      bundle['assets/KenneyStations.js'] = asset('assets/KenneyStations.js', live)
      dock.code += `\nvoid import("./KenneyMount.js").then((m)=>{m.mountKenneyFurniture()});\n`
    },
  }
}
