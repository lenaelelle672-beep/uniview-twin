import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的接线摘掉。
 * drei useVideoTexture 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * hls.js 在这里换成空桩：本地 mp4 不走 m3u8，真实库不能进任何产物。
 */
export const SCREEN_VIDEO_SOURCE_BLOCK = `// T074：工位屏。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../screen-video/mount').then((mod) => {
  mod.mountScreenVideo()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/screen-video/mount.ts', import.meta.url))
const VIDEO_ENTRY = fileURLToPath(new URL('../src/screen-video/DeskScreenVideo.tsx', import.meta.url))
const VIDEO_TEXTURE = fileURLToPath(new URL('../node_modules/three/src/textures/VideoTexture.js', import.meta.url))

const HLS_MARKERS = ['bufferStalledError', 'hls.js version']
const SURFACE_BANNED = ['ScreenVideoTexture', 'WebcamVideoTexture']

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

function fiberShim(indexFile: string, useThree: string): string {
  const from = fromIndex(indexFile)
  return `import { ${useThree} as useThree } from ${from}
export { useThree }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = fromIndex(indexFile)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function threeShim(): string {
  return `export { VideoTexture } from ${JSON.stringify(VIDEO_TEXTURE)}\n`
}

function hlsStub(): string {
  return `export const Events = { MEDIA_ATTACHED: 'hlsMediaAttached' }
export class Hls {
  static isSupported() { return false }
  on() {}
  attachMedia() {}
  loadSource() {}
  destroy() {}
}
export default Hls
`
}

function shimPlugin(names: GridBindings, externalVideo: boolean): EsbuildPlugin {
  return {
    name: 'screen-video-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalVideo) {
        build.onResolve({ filter: /^\.\/DeskScreenVideo(?:\.tsx)?$/ }, () => ({
          path: './DeskScreenVideo.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'screen-video-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'screen-video-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'screen-video-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'screen-video-shim' }))
      build.onResolve({ filter: /^hls\.js$/ }, () => ({ path: 'hls', namespace: 'screen-video-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'screen-video-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'screen-video-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names.useThree)
                : args.path === 'three'
                  ? threeShim()
                  : args.path === 'hls'
                    ? hlsStub()
                    : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(entry: string, externalVideo: boolean, names: GridBindings): Promise<string> {
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
    plugins: [shimPlugin(names, externalVideo)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T074：工位屏分包没有打成单个文件')
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

function leaked(source: string, markers: readonly string[]): string | null {
  for (const marker of markers) {
    if (source.includes(marker)) return marker
  }
  return null
}

export function screenVideoAfterHash(): Plugin {
  return {
    name: 'screen-video-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(SCREEN_VIDEO_SOURCE_BLOCK)) {
        this.error('T074：dock 里的工位屏接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(SCREEN_VIDEO_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T074：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      const gate = `${index.code}\n${fx.code}\n${dock.code}`
      if (/useVideoTexture|DeskScreenVideo|screen-video\/|hls\.js/.test(gate)) {
        this.error('T074：工位屏或 hls 被打进了入口包、balancedFx 或哈希前的 dock')
      }
      const gateLeak = leaked(gate, [...HLS_MARKERS, ...SURFACE_BANNED])
      if (gateLeak) {
        this.error(`T074：门禁包里出现了 ${gateLeak}`)
        return
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const scrub = (source: string) => source.replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '')
      const mount = scrub(await bundleEntry(MOUNT_ENTRY, true, names))
      const video = scrub(await bundleEntry(VIDEO_ENTRY, false, names))
      if (!mount.includes('./DeskScreenVideo.js') || !mount.includes('mountScreenVideo')) {
        this.error('T074：开关分包没有延迟加载工位屏')
      }
      if (mount.includes('.m3u8') || mount.includes('loadedmetadata') || mount.includes('isVideoTexture')) {
        this.error('T074：开关分包把 VideoTexture 打进去了')
      }
      if (!video.includes('drei-useVideoTexture') || !video.includes('.m3u8') || !video.includes('/media/desk-cam.mp4')) {
        this.error('T074：工位屏分包里没有 drei useVideoTexture 或本地短片')
      }
      if (!video.includes('playsInline') || !video.includes('isVideoTexture')) {
        this.error('T074：工位屏分包里没有 VideoTexture')
      }
      const videoLeak = leaked(video, [...HLS_MARKERS, ...SURFACE_BANNED, 'WebGLRenderer'])
      const mountLeak = leaked(mount, [...HLS_MARKERS, ...SURFACE_BANNED, 'WebGLRenderer'])
      if (videoLeak || mountLeak) {
        this.error(`T074：工位屏分包里出现了 ${videoLeak ?? mountLeak}`)
        return
      }
      if (!video.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T074：工位屏分包没有复用入口包')
      }
      const linkAt = `${video}\n${mount}`.indexOf('https://')
      if (linkAt >= 0) {
        const blob = `${video}\n${mount}`
        this.error(`T074：工位屏分包带了外链 ${blob.slice(Math.max(0, linkAt - 40), linkAt + 80)}`)
      }
      if (mount.length > 80_000 || video.length > 800_000) {
        this.error(`T074：工位屏分包过大 mount=${mount.length} video=${video.length}`)
      }
      bundle['assets/ScreenVideoMount.js'] = asset('assets/ScreenVideoMount.js', mount)
      bundle['assets/DeskScreenVideo.js'] = asset('assets/DeskScreenVideo.js', video)
      dock.code += `\nvoid import("./ScreenVideoMount.js").then((m)=>{m.mountScreenVideo()});\n`
    },
  }
}
