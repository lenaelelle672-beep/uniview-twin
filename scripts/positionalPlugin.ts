import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * T108：哈希定稿前把 dock 里的空间音接线摘掉。
 * drei PositionalAudio 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。监听和声源类打进这个分包，不给入口包加导出。
 */
export const POSITIONAL_SOURCE_BLOCK = `// T108：告警空间音。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../audio/mountPositional').then((mod) => {
  mod.mountPositionalAudio()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/audio/mountPositional.ts', import.meta.url))
const AUDIO_LISTENER = fileURLToPath(new URL('../node_modules/three/src/audio/AudioListener.js', import.meta.url))
const AUDIO_LOADER = fileURLToPath(new URL('../node_modules/three/src/loaders/AudioLoader.js', import.meta.url))
const POSITIONAL_AUDIO = fileURLToPath(new URL('../node_modules/three/src/audio/PositionalAudio.js', import.meta.url))
const AUDIO_CONTEXT = fileURLToPath(new URL('../node_modules/three/src/audio/AudioContext.js', import.meta.url))

/** 入口包里已有 three 的 PositionalAudio 文本，不能拿这个裸名当泄漏。 */
const LEAKS = ['mountPositionalAudio', 'PositionalCue', 'audio/mountPositional', 'core/PositionalAudio', 'ALARM_REF_DISTANCE']

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

function reactShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.react} as React } from ${from}
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
export const createContext = React.createContext
export const useContext = React.useContext
`
}

function jsxShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.jsx} as jsxRuntime } from ${from}
export const jsx = jsxRuntime.jsx
export const jsxs = jsxRuntime.jsxs
export const Fragment = jsxRuntime.Fragment
`
}

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.useThree} as useThree, ${names.extend} as extend } from ${from}
export { useThree, extend }
const loads = new Map()
export function useLoader(Loader, url) {
  useThree((state) => state.gl)
  const key = typeof url === 'string' ? url : String(url)
  let slot = loads.get(key)
  if (!slot) {
    const created = { status: 'pending', value: null }
    const loader = new Loader()
    created.promise = loader.loadAsync(url).then(
      (value) => {
        created.status = 'ready'
        created.value = value
        return value
      },
      () => {
        created.status = 'error'
        created.value = null
        return null
      },
    )
    slot = created
    loads.set(key, slot)
  }
  if (slot.status === 'pending') throw slot.promise
  return slot.value
}
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function threeShim(): string {
  return `export { AudioListener } from ${JSON.stringify(AUDIO_LISTENER)}
export { AudioLoader } from ${JSON.stringify(AUDIO_LOADER)}
export { PositionalAudio } from ${JSON.stringify(POSITIONAL_AUDIO)}
export { AudioContext } from ${JSON.stringify(AUDIO_CONTEXT)}
`
}

function shimPlugin(names: GridBindings): EsbuildPlugin {
  return {
    name: 'positional-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'positional-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'positional-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'positional-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'positional-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'positional-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'positional-shim' }, (args) => {
        if (args.path === 'react') return { contents: reactShim(names.indexFile, names), loader: 'js' }
        if (args.path === 'jsx') return { contents: jsxShim(names.indexFile, names), loader: 'js' }
        if (args.path === 'fiber') return { contents: fiberShim(names.indexFile, names), loader: 'js' }
        if (args.path === 'store') return { contents: storeShim(names.indexFile, names), loader: 'js' }
        return { contents: threeShim(), loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

function asset(fileName: string, source: string) {
  return {
    type: 'asset' as const,
    fileName,
    name: 'positionalAudio',
    names: ['positionalAudio'],
    originalFileName: null,
    originalFileNames: [] as string[],
    source,
    needsCodeReference: false,
  }
}

export function positionalAfterHash(): Plugin {
  return {
    name: 'positional-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(POSITIONAL_SOURCE_BLOCK)) {
        this.error('T108：dock 里的空间音接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(POSITIONAL_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) {
        this.error('T108：找不到入口包、dock 或 DemandLoop')
        return
      }
      for (const chunk of [index, loop, fx, dock]) {
        if (!chunk) continue
        for (const leak of LEAKS) {
          if (chunk.code.includes(leak)) this.error(`T108：${leak} 被打进了 ${chunk.fileName}`)
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.error(`T108：${message}`)
        return
      }
      const built = await esbuild({
        absWorkingDir: ROOT,
        entryPoints: [MOUNT_ENTRY],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        legalComments: 'none',
        write: false,
        jsx: 'automatic',
        plugins: [shimPlugin(names)],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountPositionalAudio') ||
        !source.includes('setRefDistance') ||
        !source.includes('AudioListener') ||
        !source.includes(`./${names.indexFile}`) ||
        source.includes('useFrame') ||
        /howler/i.test(source) ||
        source.includes('from"three"') ||
        source.includes("from'three'") ||
        source.length > 2_000_000
      ) {
        this.error('T108：空间音分包没有独立打出来')
      }
      bundle['assets/PositionalAudio.js'] = asset('assets/PositionalAudio.js', source)
      dock.code += `\nvoid import("./PositionalAudio.js").then((m)=>{m.mountPositionalAudio()});\n`
    },
  }
}
