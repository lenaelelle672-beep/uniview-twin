import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings } from '../src/grid/bindings'

/**
 * 和 T059 同一手法：哈希定稿前把 dock 里的接线摘掉，
 * drei Decal 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 */
export const DECAL_SOURCE_BLOCK = `// T065：墙面告警贴花。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../decals/mount').then((mod) => {
  mod.mountWallDecals()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/decals/mount.ts', import.meta.url))
const DECAL_ENTRY = fileURLToPath(new URL('../src/decals/WallDecals.tsx', import.meta.url))
const DECAL_GEOMETRY = fileURLToPath(
  new URL('../node_modules/three-stdlib/geometries/DecalGeometry.js', import.meta.url),
)

const THREE_KEYS = [
  'Mesh',
  'Vector3',
  'Object3D',
  'BufferGeometry',
  'Matrix4',
  'Float32BufferAttribute',
  'ShaderMaterial',
  'Color',
  'Vector2',
  'Uniform',
  'UniformsUtils',
  'MathUtils',
  'REVISION',
  'Texture',
  'SRGBColorSpace',
] as const

type ThreeKey = (typeof THREE_KEYS)[number]

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

function fromIndex(indexFile: string): string {
  return JSON.stringify(`./${indexFile}`)
}

function exportMap(indexCode: string): Map<string, string> {
  const tail = indexCode.slice(indexCode.lastIndexOf('export{'))
  const map = new Map<string, string>()
  for (const match of tail.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    map.set(match[1], match[2])
  }
  if (map.size === 0) throw new Error('T065：入口包没有导出表')
  return map
}

function threeNamespace(indexCode: string): string {
  const marker = 'ACESFilmicToneMapping:'
  const at = indexCode.indexOf(marker)
  if (at < 0) throw new Error('T065：入口包里没有 three 命名空间')
  const start = indexCode.lastIndexOf('__proto__:null,', at)
  const end = indexCode.indexOf('},Symbol.toStringTag', at)
  if (start < 0 || end < 0) throw new Error('T065：three 命名空间边界不对')
  return indexCode.slice(start, end)
}

function threeExports(indexCode: string): Record<ThreeKey, string> {
  const body = threeNamespace(indexCode)
  const exported = exportMap(indexCode)
  const names = {} as Record<ThreeKey, string>
  for (const key of THREE_KEYS) {
    const found = body.match(new RegExp(`\\b${key}:([A-Za-z_$][\\w$]*)`))
    if (!found) throw new Error(`T065：three 命名空间缺少 ${key}`)
    const external = exported.get(found[1])
    if (!external) throw new Error(`T065：three.${key} 没有从入口包导出`)
    names[key] = external
  }
  return names
}

function reactShim(indexFile: string, react: string, jsx: string): string {
  const from = fromIndex(indexFile)
  return `import { ${react} as React, ${jsx} as runtime } from ${from}
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
export const lazy = React.lazy
export const createContext = React.createContext
export const useContext = React.useContext
export const version = React.version
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
`
}

function fiberShim(indexFile: string, useThree: string, extend: string): string {
  const from = fromIndex(indexFile)
  return `import { ${useThree} as useThree, ${extend} as extend } from ${from}
export { useThree, extend }
export function applyProps(object, props) {
  for (const key in props) {
    const value = props[key]
    if (value === undefined) continue
    const target = object[key]
    if (
      target &&
      typeof target.set === 'function' &&
      typeof target.copy === 'function' &&
      value &&
      value.constructor &&
      target.constructor === value.constructor
    ) {
      target.copy(value)
    } else if (target && typeof target.set === 'function' && Array.isArray(value)) {
      if (typeof target.fromArray === 'function') target.fromArray(value)
      else target.set(value[0], value[1], value[2])
    } else if (target && typeof target.set === 'function' && typeof value === 'number') {
      if (typeof target.setScalar === 'function') target.setScalar(value)
      else target.set(value)
    } else {
      object[key] = value
    }
  }
  return object
}
export function useLoader() {
  throw new Error('贴花不走 useLoader')
}
`
}

function threeShim(indexFile: string, names: Record<ThreeKey, string>): string {
  const from = fromIndex(indexFile)
  const spec = THREE_KEYS.map((key) => `${names[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${from}
export { ${THREE_KEYS.join(', ')} }
export class Euler {
  constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
    this.isEuler = true
    this.x = x
    this.y = y
    this.z = z
    this.order = order
  }
  set(x, y, z, order) {
    this.x = x
    this.y = y
    this.z = z
    if (order !== undefined) this.order = order
    return this
  }
  copy(other) {
    this.x = other.x
    this.y = other.y
    this.z = other.z
    if (other.order) this.order = other.order
    return this
  }
}
export class TextureLoader {
  load() {
    return null
  }
}
`
}

function storeShim(indexFile: string, store: string): string {
  const from = fromIndex(indexFile)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(indexFile: string, react: string, jsx: string, useThree: string, extend: string, store: string, three: Record<ThreeKey, string>, externalDecals: boolean): EsbuildPlugin {
  return {
    name: 'decal-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'decal-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'decal-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'decal-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'decal-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'decal-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: DECAL_GEOMETRY }))
      if (externalDecals) {
        build.onResolve({ filter: /^\.\/WallDecals(?:\.tsx)?$/ }, () => ({
          path: './WallDecals.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'decal-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(indexFile, react, jsx)
            : args.path === 'jsx'
              ? `export { jsx, jsxs, Fragment } from 'react'\n`
              : args.path === 'fiber'
                ? fiberShim(indexFile, useThree, extend)
                : args.path === 'three'
                  ? threeShim(indexFile, three)
                  : storeShim(indexFile, store)
        return { contents, loader: 'js' }
      })
    },
  }
}

async function bundleEntry(entry: string, externalDecals: boolean, indexFile: string, react: string, jsx: string, useThree: string, extend: string, store: string, three: Record<ThreeKey, string>): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    write: false,
    jsx: 'automatic',
    plugins: [shimPlugin(indexFile, react, jsx, useThree, extend, store, three, externalDecals)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T065：贴花分包没有打成单个文件')
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

export function decalAfterHash(): Plugin {
  return {
    name: 'decal-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(DECAL_SOURCE_BLOCK)) {
        this.error('T065：dock 里的贴花接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(DECAL_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T065：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      if (index.code.includes('DecalMount') || index.code.includes('WallDecals') || index.code.includes('decals/mount')) {
        this.error('T065：贴花被打进了入口包')
      }
      if (fx.code.includes('WallDecals') || fx.code.includes('core/Decal') || fx.code.includes('decals/mount')) {
        this.error('T065：贴花被打进了 balancedFx')
      }
      if (dock.code.includes('decals/mount') || dock.code.includes('WallDecals')) {
        this.error('T065：哈希前的 dock 仍带着贴花')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const three = threeExports(index.code)
      const scrub = (source: string) => source.replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '')
      const mount = scrub(await bundleEntry(MOUNT_ENTRY, true, names.indexFile, names.react, names.jsx, names.useThree, names.extend, names.store, three))
      const decals = scrub(await bundleEntry(DECAL_ENTRY, false, names.indexFile, names.react, names.jsx, names.useThree, names.extend, names.store, three))
      if (mount.includes('Decal must have a Mesh') || mount.includes('DecalGeometry')) {
        this.error('T065：开关分包把 Decal 打进去了')
      }
      if (!mount.includes('./WallDecals.js') || !mount.includes('mountWallDecals')) {
        this.error('T065：开关分包没有延迟加载 Decal')
      }
      if (!decals.includes('Decal must have a Mesh') || !decals.includes('requires a url or texture')) {
        this.error('T065：Decal 分包里没有 drei Decal 或 Image')
      }
      if (!decals.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T065：贴花分包没有复用入口包')
      }
      const linkAt = `${decals}\n${mount}`.indexOf('https://')
      if (decals.includes('jsdelivr') || mount.includes('jsdelivr') || linkAt >= 0) {
        const blob = `${decals}\n${mount}`
        this.error(`T065：贴花分包带了外链 ${blob.slice(Math.max(0, linkAt - 60), linkAt + 80)}`)
      }
      if (decals.length > 200_000 || mount.length > 80_000) {
        this.error('T065：贴花分包把 three 整包打进去了')
      }
      bundle['assets/DecalMount.js'] = asset('assets/DecalMount.js', mount)
      bundle['assets/WallDecals.js'] = asset('assets/WallDecals.js', decals)
      dock.code += `\nvoid import("./DecalMount.js").then((m)=>{m.mountWallDecals()});\n`
    },
  }
}
