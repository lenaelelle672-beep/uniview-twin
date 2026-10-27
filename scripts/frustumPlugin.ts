import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的接线摘掉，useIntersect 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和 useIntersect 分包接回 dock。
 */
export const FRUSTUM_SOURCE_BLOCK = `// T076：视锥暂停。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../frustum/mount').then((mod) => {
  mod.mountFrustumPause()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/frustum/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/frustum/BlinkFrustum.tsx', import.meta.url))

const LEAKS = ['useIntersect', 'mountFrustumPause', 'FrustumPause']

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

function importMap(source: string, indexFile: string): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /import\s*\{([^}]+)\}\s*from\s*["']\.\/([^"']+)["']/g
  for (const match of source.matchAll(pattern)) {
    if (match[2] !== indexFile) continue
    for (const part of match[1].split(',')) {
      const piece = part.trim()
      if (!piece) continue
      const [exported, local] = piece.split(/\s+as\s+/)
      map.set((local ?? exported).trim(), exported.trim())
    }
  }
  return map
}

/** DemandLoop 已经从入口包拿 addAfterEffect。认出导出名，哨兵的冲刷器才能接到同一条循环。 */
export function discoverAddAfterEffect(loopCode: string, indexFile: string): string {
  const at = loopCode.indexOf('visibilitychange')
  if (at < 0) throw new Error('T076：DemandLoop 里没有 visibilitychange，无法认出 addAfterEffect')
  const head = loopCode.slice(Math.max(0, at - 2500), at)
  const effectAt = head.lastIndexOf('useEffect(')
  const effect = effectAt < 0 ? head : head.slice(effectAt)
  const match = effect.match(/const\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\(\(\)=>\{/)
  const local = match?.[2]
  if (!local) throw new Error(`T076：visibilitychange 所在效果里没有 addAfterEffect。片段：${effect.slice(0, 500)}`)
  const exported = importMap(loopCode, indexFile).get(local)
  if (!exported) throw new Error(`T076：${local} 不是从入口包导入的。片段：${effect.slice(0, 500)}`)
  return exported
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

function stateModule(): string {
  return `const before = new Set()
const after = new Set()
function add(bucket, callback) {
  const sub = { callback }
  bucket.add(sub)
  return () => bucket.delete(sub)
}
export function addEffect(callback) {
  return add(before, callback)
}
export function addAfterEffect(callback) {
  return add(after, callback)
}
export function flushFrustumBefore() {
  for (const sub of before) sub.callback()
}
export function flushFrustumAfter() {
  for (const sub of after) sub.callback()
}
`
}

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame } from ${from}
export { useThree, useFrame }
export { addEffect, addAfterEffect } from 'frustum-loop-state'
`
}

function loopBindModule(indexFile: string, names: GridBindings, addAfter: string): string {
  const from = fromIndex(indexFile)
  return `import { useEffect } from 'react'
import { ${names.useFrame} as useFrame, ${addAfter} as addAfterEffect } from ${from}
import { flushFrustumBefore, flushFrustumAfter } from 'frustum-loop-state'
export function useFrustumLoop() {
  useFrame(() => { flushFrustumBefore() })
  useEffect(() => addAfterEffect(() => { flushFrustumAfter() }), [])
}
export function afterRender(callback) {
  return addAfterEffect(() => { callback() })
}
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(names: GridBindings, addAfter: string, live: boolean): EsbuildPlugin {
  return {
    name: 'frustum-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'frustum-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'frustum-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'frustum-shim' }))
      build.onResolve({ filter: /^hls\.js$/ }, () => {
        throw new Error('T076：useIntersect 分包不应拉到 hls.js')
      })
      if (!live) {
        build.onResolve({ filter: /BlinkFrustum(?:\.tsx)?$/ }, () => ({
          path: './BlinkFrustum.js',
          external: true,
        }))
      } else {
        build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'frustum-shim' }))
        build.onResolve({ filter: /loopBind(?:\.tsx)?$/ }, () => ({ path: 'loop', namespace: 'frustum-shim' }))
        build.onResolve({ filter: /^frustum-loop-state$/ }, () => ({ path: 'state', namespace: 'frustum-shim' }))
        build.onResolve({ filter: /^@react-three\/drei$/ }, () => {
          throw new Error('T076：不要从 drei 桶导入，以免带上 hls / VideoTexture')
        })
      }
      build.onLoad({ filter: /.*/, namespace: 'frustum-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'store'
                ? storeShim(names.indexFile, names)
                : args.path === 'fiber'
                  ? fiberShim(names.indexFile, names)
                  : args.path === 'loop'
                    ? loopBindModule(names.indexFile, names, addAfter)
                    : stateModule()
        return { contents, loader: 'js' }
      })
    },
  }
}

async function bundleEntry(entry: string, names: GridBindings, addAfter: string, live: boolean): Promise<string> {
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
    plugins: [shimPlugin(names, addAfter, live)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T076：视锥分包没有打成单个文件')
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

export function frustumAfterHash(): Plugin {
  return {
    name: 'frustum-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(FRUSTUM_SOURCE_BLOCK)) {
        this.error('T076：dock 里的视锥接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(FRUSTUM_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop) {
        this.error('T076：找不到入口包、dock 或 DemandLoop')
        return
      }
      for (const chunk of [index, loop, fx]) {
        if (!chunk) continue
        for (const leak of LEAKS) {
          if (chunk.code.includes(leak)) this.error(`T076：${leak} 被打进了 ${chunk.fileName}`)
        }
      }
      if (dock.code.includes('frustum/mount') || dock.code.includes('mountFrustumPause')) {
        this.error('T076：哈希前的 dock 仍带着视锥暂停')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const addAfter = discoverAddAfterEffect(loop.code, names.indexFile)
      const mount = await bundleEntry(MOUNT_ENTRY, names, addAfter, false)
      const live = await bundleEntry(LIVE_ENTRY, names, addAfter, true)
      if (mount.includes('onBeforeRender') || mount.includes('useIntersect') || mount.includes('hls')) {
        this.error('T076：开关分包把 useIntersect 打进去了')
      }
      if (!mount.includes('./BlinkFrustum.js') || !mount.includes('mountFrustumPause')) {
        this.error('T076：开关分包没有延迟加载视锥宿主')
      }
      if (!live.includes('onBeforeRender')) this.error('T076：视锥分包里没有 drei useIntersect')
      if (/hls\.js|VideoTexture|IntersectionObserver|watchCanvasOffscreen|from"@react-three\/drei"|Detailed/.test(live)) {
        this.error('T076：视锥分包带上了划界之外的依赖')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T076：视锥分包没有复用入口包')
      }
      if (live.length > 24_000 || mount.length > 16_000) this.error('T076：视锥分包把 three 整包打进去了')
      bundle['assets/FrustumMount.js'] = asset('assets/FrustumMount.js', mount)
      bundle['assets/BlinkFrustum.js'] = asset('assets/BlinkFrustum.js', live)
      dock.code += `\nvoid import("./FrustumMount.js").then((m)=>{m.mountFrustumPause()});\n`
    },
  }
}
