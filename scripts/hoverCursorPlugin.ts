import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的悬停指针接线摘掉。
 * drei useCursor 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 */
export const HOVER_CURSOR_SOURCE_BLOCK = `// T075：悬停指针。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../cursor/mount').then((mod) => {
  mod.mountHoverCursor()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/cursor/mount.ts', import.meta.url))

const LEAKS = ['useCursor', 'HoverCursor', 'mountHoverCursor', 'cursor/mount', 'cursor/policy']

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
export const createElement = React.createElement
export const Fragment = React.Fragment
`
}

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.useThree} as useThree } from ${from}
export { useThree }
`
}

function shimPlugin(names: GridBindings): EsbuildPlugin {
  return {
    name: 'hover-cursor-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hover-cursor-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'hover-cursor-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'hover-cursor-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'hover-cursor-shim' }, (args) => {
        if (args.path === 'three') {
          return { contents: 'export {}\n', loader: 'js' }
        }
        const contents = args.path === 'react' ? reactShim(names.indexFile, names) : fiberShim(names.indexFile, names)
        return { contents, loader: 'js' }
      })
    },
  }
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

export function hoverCursorAfterHash(): Plugin {
  return {
    name: 'hover-cursor-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(HOVER_CURSOR_SOURCE_BLOCK)) {
        this.error('T075：dock 里的悬停指针接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(HOVER_CURSOR_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) {
        this.error('T075：找不到入口包、dock 或 DemandLoop')
        return
      }
      for (const chunk of [index, loop, fx]) {
        if (!chunk) continue
        for (const leak of LEAKS) {
          if (chunk.code.includes(leak)) this.error(`T075：${leak} 被打进了 ${chunk.fileName}`)
        }
      }
      if (dock.code.includes('mountHoverCursor') || dock.code.includes('cursor/mount')) {
        this.error('T075：哈希前的 dock 仍带着悬停指针')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
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
      if (built.outputFiles.length !== 1 || !source.includes('mountHoverCursor')) {
        this.error('T075：悬停指针分包没有独立打出来')
      }
      if (!source.includes(`./${names.indexFile}`)) {
        this.error('T075：悬停指针分包没有复用入口包')
      }
      if (!source.includes('.cursor') || !source.includes('pointer')) {
        this.error('T075：分包里没有 useCursor 的光标写入')
      }
      if (source.includes('from"three"') || source.includes("from'three'") || source.length > 20_000) {
        this.error('T075：悬停指针分包把 three 打进去了')
      }
      bundle['assets/HoverCursor.js'] = asset('assets/HoverCursor.js', source)
      dock.code += `\nvoid import("./HoverCursor.js").then((m)=>{m.mountHoverCursor()});\n`
    },
  }
}
