import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的接线摘掉。
 * drei Image 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和海报分包接回 dock。不并进 DecalMount / WallDecals。
 */
export const SCREEN_IMAGE_SOURCE_BLOCK = `// T079：工位屏静态海报。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../screen-image/mount').then((mod) => {
  mod.mountScreenImage()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/screen-image/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/screen-image/DeskScreenPosters.tsx', import.meta.url))

const THREE_KEYS = [
  'Color',
  'Vector2',
  'ShaderMaterial',
  'MathUtils',
  'Uniform',
  'UniformsUtils',
  'REVISION',
  'Texture',
  'SRGBColorSpace',
] as const

type ThreeKey = (typeof THREE_KEYS)[number]

const LEAKS = ['RoundedPlane', 'maath', 'useVideoTexture', 'hls.js', 'jsdelivr', 'githack', 'ScreenVideoTexture', 'WebcamVideoTexture']

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
  if (map.size === 0) throw new Error('T079：入口包没有导出表')
  return map
}

function threeNamespace(indexCode: string): string {
  const marker = 'ACESFilmicToneMapping:'
  const at = indexCode.indexOf(marker)
  if (at < 0) throw new Error('T079：入口包里没有 three 命名空间')
  const start = indexCode.lastIndexOf('__proto__:null,', at)
  const end = indexCode.indexOf('},Symbol.toStringTag', at)
  if (start < 0 || end < 0) throw new Error('T079：three 命名空间边界不对')
  return indexCode.slice(start, end)
}

function threeExports(indexCode: string): Record<ThreeKey, string> {
  const body = threeNamespace(indexCode)
  const exported = exportMap(indexCode)
  const names = {} as Record<ThreeKey, string>
  for (const key of THREE_KEYS) {
    const found = body.match(new RegExp(`\\b${key}:([A-Za-z_$][\\w$]*)`))
    if (!found) throw new Error(`T079：three 命名空间缺少 ${key}`)
    const external = exported.get(found[1])
    if (!external) throw new Error(`T079：three.${key} 没有从入口包导出`)
    names[key] = external
  }
  return names
}

function reactShim(indexFile: string, react: string): string {
  const from = fromIndex(indexFile)
  return `import { ${react} as React } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useCallback = React.useCallback
export const forwardRef = React.forwardRef
export const useImperativeHandle = React.useImperativeHandle
export const createElement = React.createElement
export const Fragment = React.Fragment
export const Suspense = React.Suspense
export const createContext = React.createContext
export const useContext = React.useContext
`
}

function jsxShim(indexFile: string, react: string, jsx: string): string {
  const from = fromIndex(indexFile)
  return `import { ${jsx} as runtime, ${react} as React } from ${from}
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = React.Fragment
`
}

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.useThree} as useThree, ${names.extend} as extend } from ${from}
export { useThree, extend }
export function useLoader() {
  throw new Error('屏海报不走 useLoader')
}
`
}

function threeShim(indexFile: string, names: Record<ThreeKey, string>): string {
  const from = fromIndex(indexFile)
  const spec = THREE_KEYS.map((key) => `${names[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${from}
export { ${THREE_KEYS.join(', ')} }
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

function shimPlugin(names: GridBindings, three: Record<ThreeKey, string>, externalLive: boolean): EsbuildPlugin {
  return {
    name: 'screen-image-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/DeskScreenPosters(?:\.tsx)?$/ }, () => ({
          path: './DeskScreenPosters.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'screen-image-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'screen-image-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'screen-image-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'screen-image-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'screen-image-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'screen-image-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? threeShim(names.indexFile, three)
                  : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(entry: string, externalLive: boolean, names: GridBindings, three: Record<ThreeKey, string>): Promise<string> {
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
    plugins: [shimPlugin(names, three, externalLive)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T079：屏海报分包没有打成单个文件')
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
  return source
    .replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '')
    .replace(/https?:\/\/[^\s"'`\\]*/g, '')
}

function leaked(source: string, markers: readonly string[]): string | null {
  for (const marker of markers) {
    if (source.includes(marker)) return marker
  }
  return null
}

function assetText(item: { type: string; source?: unknown } | undefined): string {
  if (!item || item.type !== 'asset' || typeof item.source !== 'string') return ''
  return item.source
}

export function screenImageAfterHash(): Plugin {
  return {
    name: 'screen-image-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(SCREEN_IMAGE_SOURCE_BLOCK)) {
        this.error('T079：dock 里的屏海报接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(SCREEN_IMAGE_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T079：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      const gate = `${index.code}\n${fx.code}\n${dock.code}`
      if (/screen-image\/|mountScreenImage|DeskScreenPoster|ScreenImageMount|requires a url or texture/.test(gate)) {
        this.error('T079：屏海报或 drei Image 被打进了入口包、balancedFx 或哈希前的 dock')
      }
      const gateLeak = leaked(gate, LEAKS)
      if (gateLeak && /screen-image|DeskScreenPoster|ScreenPoster/.test(gate)) {
        this.error(`T079：门禁包里出现了 ${gateLeak}`)
        return
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const three = threeExports(index.code)
      const mount = scrub(await bundleEntry(MOUNT_ENTRY, true, names, three))
      const live = scrub(await bundleEntry(LIVE_ENTRY, false, names, three))
      if (!mount.includes('./DeskScreenPosters.js') || !mount.includes('mountScreenImage')) {
        this.error('T079：开关分包没有延迟加载屏海报')
      }
      if (mount.includes('requires a url or texture') || mount.includes('planeGeometry') || mount.includes('imageMaterial')) {
        this.error('T079：开关分包把 Image 打进去了')
      }
      if (!live.includes('drei-Image') || !live.includes('requires a url or texture') || !live.includes('planeGeometry')) {
        this.error('T079：海报分包里没有 drei Image 或普通 plane')
      }
      if (!live.includes('/textures/screens/desk.webp') || !live.includes('/textures/screens/camera.jpg')) {
        this.error('T079：海报分包里没有本地 jpg/webp')
      }
      const liveLeak = leaked(live, LEAKS)
      const mountLeak = leaked(mount, LEAKS)
      if (liveLeak || mountLeak) {
        this.error(`T079：屏海报分包里出现了 ${liveLeak ?? mountLeak}`)
        return
      }
      if (live.includes('WebGLRenderer') || mount.includes('WebGLRenderer')) {
        this.error('T079：屏海报分包把 three 整包打进去了')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T079：屏海报分包没有复用入口包')
      }
      const linkAt = `${live}\n${mount}`.indexOf('https://')
      if (linkAt >= 0) {
        const blob = `${live}\n${mount}`
        this.error(`T079：屏海报分包带了外链 ${blob.slice(Math.max(0, linkAt - 40), linkAt + 80)}`)
      }
      if (mount.length > 80_000 || live.length > 800_000) {
        this.error(`T079：屏海报分包过大 mount=${mount.length} live=${live.length}`)
      }
      const decalText = `${assetText(bundle['assets/DecalMount.js'])}\n${assetText(bundle['assets/WallDecals.js'])}`
      if (!decalText.includes('mountWallDecals') || !decalText.includes('requires a url or texture')) {
        this.error('T079：找不到已落盘的贴花分包，无法确认海报没有并进去')
        return
      }
      if (/mountScreenImage|DeskScreenPoster|\/textures\/screens\/|ScreenImageMount/.test(decalText)) {
        this.error('T079：海报被并进了 DecalMount 或 WallDecals')
      }
      bundle['assets/ScreenImageMount.js'] = asset('assets/ScreenImageMount.js', mount)
      bundle['assets/DeskScreenPosters.js'] = asset('assets/DeskScreenPosters.js', live)
      dock.code += `\nvoid import("./ScreenImageMount.js").then((m)=>{m.mountScreenImage()});\n`
    },
  }
}
