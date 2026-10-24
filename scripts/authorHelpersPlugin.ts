import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 和 T059 同一手法：哈希定稿前把 dock 里的接线摘掉，
 * 入口包文件名保持不变；定稿后再把独立分包接回 dock。
 * drei useHelper 不进 vite 图，所以不会带动 index / balancedFx / DemandLoop 的哈希。
 */
export const AUTHOR_HELPER_SOURCE_BLOCK = `// T066：灯光和相机辅助。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../author/helpers/mount').then((mod) => {
  mod.mountAuthorHelpers()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/author/helpers/mount.ts', import.meta.url))
const HELPERS_ENTRY = fileURLToPath(new URL('../src/author/helpers/LightCameraHelpers.tsx', import.meta.url))

const LEAKS = ['author/helpers', 'LightCameraHelpers', 'mountAuthorHelpers', 'useHelper', 'directionalLightHelper']

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
export const lazy = React.lazy
export const createContext = React.createContext
export const useContext = React.useContext
export const version = React.version
`
}

function jsxShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.jsx} as runtime, ${names.react} as React } from ${from}
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = React.Fragment
`
}

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame } from ${from}
export { useThree, useFrame }
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(names: GridBindings, externalHelpers: boolean): EsbuildPlugin {
  return {
    name: 'author-helper-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'author-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'author-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'author-shim' }))
      build.onResolve({ filter: /^\.\.\/\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'author-shim' }))
      if (externalHelpers) {
        build.onResolve({ filter: /^\.\/LightCameraHelpers(?:\.tsx)?$/ }, () => ({
          path: './AuthorHelpers.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'author-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : storeShim(names.indexFile, names)
        return { contents, loader: 'js' }
      })
    },
  }
}

async function bundleEntry(entry: string, externalHelpers: boolean, names: GridBindings): Promise<string> {
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
    plugins: [shimPlugin(names, externalHelpers)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) {
    throw new Error('T066：辅助分包没有打成单个文件')
  }
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

export function authorHelpersAfterHash(): Plugin {
  return {
    name: 'author-helpers-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(AUTHOR_HELPER_SOURCE_BLOCK)) {
        this.error('T066：dock 里的辅助接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(AUTHOR_HELPER_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) {
        this.error('T066：找不到入口包、dock 或 DemandLoop')
        return
      }
      for (const chunk of [index, loop, fx]) {
        if (!chunk) continue
        for (const leak of LEAKS) {
          if (chunk.code.includes(leak)) this.error(`T066：${leak} 被打进了 ${chunk.fileName}`)
        }
      }
      if (dock.code.includes('author/helpers') || dock.code.includes('mountAuthorHelpers')) {
        this.error('T066：哈希前的 dock 仍带着辅助')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const mount = await bundleEntry(MOUNT_ENTRY, true, names)
      const helpers = await bundleEntry(HELPERS_ENTRY, false, names)
      if (mount.includes('useHelper') || mount.includes('directionalLightHelper') || mount.includes('cameraHelper')) {
        this.error('T066：开关分包把 useHelper 打进去了')
      }
      if (!mount.includes('./AuthorHelpers.js')) this.error('T066：开关分包没有延迟加载辅助')
      if (!helpers.includes('useHelper') && !helpers.includes('.update')) {
        this.error('T066：辅助分包里没有 drei useHelper')
      }
      if (!helpers.includes('directionalLightHelper') || !helpers.includes('cameraHelper')) {
        this.error('T066：辅助分包里没有灯光或相机辅助')
      }
      if (/\bRectAreaLight\b/.test(helpers) || helpers.includes('RectAreaLightHelper')) {
        this.error('T066：辅助分包带上了矩形面光')
      }
      if (!helpers.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T066：辅助分包没有复用入口包')
      }
      if (helpers.length > 40_000 || mount.length > 40_000) {
        this.error('T066：辅助分包把 three 整包打进去了')
      }
      bundle['assets/AuthorHelperMount.js'] = asset('assets/AuthorHelperMount.js', mount)
      bundle['assets/AuthorHelpers.js'] = asset('assets/AuthorHelpers.js', helpers)
      dock.code += `\nvoid import("./AuthorHelperMount.js").then((m)=>{m.mountAuthorHelpers()});\n`
    },
  }
}
