import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的轮询接线摘掉，drei CycleRaycast 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和 CycleRaycast 分包接回 dock。
 */
export const CYCLE_SOURCE_BLOCK = `// T086：密叠拾取轮询。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../cycle-raycast/mount').then((mod) => {
  mod.mountCycleRaycast()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/cycle-raycast/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/cycle-raycast/CycleLayer.tsx', import.meta.url))

const LEAKS = ['CycleRaycast', 'CycleLayer', 'mountCycleRaycast', 'cycle-raycast', 'CycleMount']

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function fail(message: string): never {
  throw new Error(`T086：${message}`)
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
export default React
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useCallback = React.useCallback
export const createElement = React.createElement
export const Fragment = React.Fragment
export const Suspense = React.Suspense
export const lazy = React.lazy
export const createContext = React.createContext
export const useContext = React.useContext
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
  return `import { ${names.useThree} as useThree } from ${from}
export { useThree }
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(names: GridBindings, externalLive: boolean): EsbuildPlugin {
  return {
    name: 'cycle-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'cycle-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'cycle-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'cycle-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'cycle-shim' }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/CycleLayer(?:\.tsx)?$/ }, () => ({
          path: './CycleRaycast.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'cycle-shim' }, (args) => {
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

async function bundleEntry(entry: string, externalLive: boolean, names: GridBindings): Promise<string> {
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
    plugins: [shimPlugin(names, externalLive)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) fail('轮询分包没有打成单个文件')
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

export function cycleRaycastAfterHash(): Plugin {
  return {
    name: 'cycle-raycast-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(CYCLE_SOURCE_BLOCK)) {
        this.error('T086：dock 里的轮询接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(CYCLE_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) fail('找不到入口包、dock、DemandLoop 或 balancedFx')
      for (const chunk of [index, loop, fx]) {
        for (const leak of LEAKS) {
          if (chunk.code.includes(leak)) fail(`${leak} 被打进了 ${chunk.fileName}`)
        }
      }
      if (LEAKS.some((leak) => dock.code.includes(leak))) fail('哈希前的 dock 仍带着轮询')
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const mount = await bundleEntry(MOUNT_ENTRY, true, names)
      const live = await bundleEntry(LIVE_ENTRY, false, names)
      const indexImport = `./${names.indexFile}`
      if (!mount.includes('./CycleRaycast.js') || !mount.includes('mountCycleRaycast')) fail('开关分包没有延迟加载 CycleRaycast')
      if (mount.includes('onPointerCancel') || mount.includes('wheelDelta')) fail('开关分包把 CycleRaycast 打进去了')
      if (!live.includes('onPointerCancel') || !live.includes('keyCode') || !live.includes('wheelDelta')) {
        fail('CycleRaycast 分包里没有 drei CycleRaycast')
      }
      if (!live.includes('focusedDeskId') || !live.includes('focusedDeviceId')) fail('CycleRaycast 分包没有写侧栏焦点')
      if (live.includes('focusDevice') || live.includes('focusSeq')) fail('CycleRaycast 分包改了镜头焦点序号')
      if (!live.includes(indexImport) || !mount.includes(indexImport)) fail('轮询分包没有复用入口包')
      const blob = `${mount}\n${live}`
      if (/from["']three["']/.test(blob) || blob.includes('WebGLRenderer') || blob.includes('PivotControls')) {
        fail('轮询分包把 three 渲染器或 PivotControls 打进去了')
      }
      if (blob.includes('https://') || blob.includes('jsdelivr')) fail('轮询分包带了外链')
      if (mount.length > 40_000 || live.length > 80_000) fail(`轮询分包过大 mount=${mount.length} live=${live.length}`)
      bundle['assets/CycleMount.js'] = asset('assets/CycleMount.js', mount)
      bundle['assets/CycleRaycast.js'] = asset('assets/CycleRaycast.js', live)
      dock.code += `\nvoid import("./CycleMount.js").then((m)=>{m.mountCycleRaycast()});\n`
    },
  }
}
