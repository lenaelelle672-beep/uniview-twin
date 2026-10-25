import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的接线摘掉，入口包文件名保持不变。
 * 定稿后再把开关分包接回 dock。Center / Bounds 仍要再按一次才加载。
 */
export const FOCUS_FIT_SOURCE_BLOCK = `// T070：对焦装入。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../focus-fit/mount').then((mod) => {
  mod.mountFocusFit()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/focus-fit/mount.ts', import.meta.url))
const CENTER_ENTRY = fileURLToPath(new URL('../src/focus-fit/CenterFit.tsx', import.meta.url))
const BOUNDS_ENTRY = fileURLToPath(new URL('../src/focus-fit/BoundsFit.tsx', import.meta.url))
const LEAVES_ENTRY = fileURLToPath(new URL('../src/focus-fit/threeLeaves.ts', import.meta.url))

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
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame, ${names.extend} as extend } from ${from}
export { useThree, useFrame, extend }
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(names: GridBindings, kind: 'mount' | 'center' | 'bounds'): EsbuildPlugin {
  return {
    name: 'focus-fit-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'focus-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'focus-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'focus-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: LEAVES_ENTRY }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'focus-shim' }))
      if (kind === 'mount') {
        build.onResolve({ filter: /CenterFit(?:\.tsx)?$/ }, (args) => {
          if (!args.importer) return null
          return { path: './FocusCenter.js', external: true }
        })
        build.onResolve({ filter: /BoundsFit(?:\.tsx)?$/ }, (args) => {
          if (!args.importer) return null
          return { path: './FocusBounds.js', external: true }
        })
      }
      build.onLoad({ filter: /.*/, namespace: 'focus-shim' }, (args) => {
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

async function bundleEntry(entry: string, kind: 'mount' | 'center' | 'bounds', names: GridBindings): Promise<string> {
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
    plugins: [shimPlugin(names, kind)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) {
    throw new Error('T070：对焦分包没有打成单个文件')
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

export function focusFitAfterHash(): Plugin {
  return {
    name: 'focus-fit-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(FOCUS_FIT_SOURCE_BLOCK)) {
        this.error('T070：dock 里的对焦接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(FOCUS_FIT_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) {
        this.error('T070：找不到入口包、dock 或 DemandLoop')
        return
      }
      if (/focus-fit|FocusCenter|FocusBounds|mountFocusFit|CenterFit|BoundsFit/.test(index.code)) {
        this.error('T070：对焦被打进了入口包')
      }
      if (/focus-fit|mountFocusFit|CenterFit|BoundsFit/.test(dock.code)) {
        this.error('T070：哈希前的 dock 仍带着对焦')
      }
      if (fx && /focus-fit|FocusCenter|FocusBounds|CenterFit|BoundsFit/.test(fx.code)) {
        this.error('T070：对焦被打进了 balancedFx')
      }
      if (/focus-fit|CenterFit|BoundsFit|mountFocusFit/.test(loop.code)) {
        this.error('T070：对焦被打进了 DemandLoop')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const mount = await bundleEntry(MOUNT_ENTRY, 'mount', names)
      const center = await bundleEntry(CENTER_ENTRY, 'center', names)
      const bounds = await bundleEntry(BOUNDS_ENTRY, 'bounds', names)
      if (!mount.includes('./FocusCenter.js') || !mount.includes('./FocusBounds.js')) {
        this.error('T070：开关分包没有分开加载 Center 和 Bounds')
      }
      if (mount.includes('onCentered') || mount.includes('maxDuration')) {
        this.error('T070：开关分包把 Center 或 Bounds 打进去了')
      }
      if (!center.includes('onCentered') || center.includes('maxDuration')) {
        this.error('T070：Center 分包不对')
      }
      if (!bounds.includes('maxDuration') || !/\.fit\(/.test(bounds)) {
        this.error('T070：Bounds 分包没有 fit')
      }
      if (bounds.includes('onCentered')) {
        this.error('T070：Bounds 分包把 Center 打进去了')
      }
      if (!center.includes(`./${names.indexFile}`) || !bounds.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T070：对焦分包没有复用入口包')
      }
      if (mount.length > 80_000 || center.length > 500_000 || bounds.length > 500_000) {
        this.error(`T070：对焦分包把 three 整包打进去了（${mount.length}/${center.length}/${bounds.length}）`)
      }
      bundle['assets/FocusMount.js'] = asset('assets/FocusMount.js', mount)
      bundle['assets/FocusCenter.js'] = asset('assets/FocusCenter.js', center)
      bundle['assets/FocusBounds.js'] = asset('assets/FocusBounds.js', bounds)
      dock.code += `\nvoid import("./FocusMount.js").then((m)=>{m.mountFocusFit()});\n`
    },
  }
}
