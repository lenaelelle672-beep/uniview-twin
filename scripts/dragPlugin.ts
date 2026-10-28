import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的拖摆接线摘掉，drei DragControls 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和 DragControls 分包接回 dock。
 * @use-gesture/react 是 drei 的传递依赖，打进懒包，不另装。
 */
export const DRAG_SOURCE_BLOCK = `// T080：作者态拖摆。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../drag-placement/mount').then((mod) => {
  mod.mountPlacementDrag()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/drag-placement/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/drag-placement/PlacementDrag.tsx', import.meta.url))
const THREE_MATH = fileURLToPath(new URL('../node_modules/three/src/math/', import.meta.url))

const THREE_KEYS = ['Vector2', 'Vector3', 'Quaternion', 'Plane', 'Matrix4'] as const

const LEAKS = ['DragControls', 'PlacementDrag', 'mountPlacementDrag', 'drag-placement', 'use-gesture', 'PivotControls', 'dragPlacement']

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function fail(message: string): never {
  throw new Error(`T080：${message}`)
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

function threeShim(indexFile: string, found: Record<string, string>, missing: readonly string[]): string {
  const lines: string[] = []
  if (Object.keys(found).length > 0) {
    const spec = Object.entries(found)
      .map(([name, external]) => `${external} as ${name}`)
      .join(', ')
    lines.push(`export { ${spec} } from ${fromIndex(indexFile)}`)
  }
  for (const name of missing) {
    lines.push(`export { ${name} } from ${JSON.stringify(`three-math/${name}.js`)}`)
  }
  return `${lines.join('\n')}\n`
}

function shimPlugin(names: GridBindings, found: Record<string, string>, missing: readonly string[], externalLive: boolean): EsbuildPlugin {
  return {
    name: 'drag-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'drag-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'drag-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'drag-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'drag-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'drag-shim' }))
      build.onResolve({ filter: /^three-math\// }, (args) => ({
        path: `${THREE_MATH}${args.path.slice('three-math/'.length)}`,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/PlacementDrag(?:\.tsx)?$/ }, () => ({
          path: './DragControls.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'drag-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'store'
                  ? storeShim(names.indexFile, names)
                  : threeShim(names.indexFile, found, missing)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  externalLive: boolean,
  names: GridBindings,
  found: Record<string, string>,
  missing: readonly string[],
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
    write: false,
    jsx: 'automatic',
    plugins: [shimPlugin(names, found, missing, externalLive)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) fail('拖摆分包没有打成单个文件')
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

export function dragAfterHash(): Plugin {
  return {
    name: 'drag-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(DRAG_SOURCE_BLOCK)) {
        this.error('T080：dock 里的拖摆接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(DRAG_SOURCE_BLOCK, ''), map: null }
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
      if (LEAKS.some((leak) => dock.code.includes(leak))) fail('哈希前的 dock 仍带着拖摆')
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const looked = lookupThreeExports(index.code, THREE_KEYS)
      const mount = await bundleEntry(MOUNT_ENTRY, true, names, looked.found, looked.missing)
      const live = await bundleEntry(LIVE_ENTRY, false, names, looked.found, looked.missing)
      const indexImport = `./${names.indexFile}`
      if (!mount.includes('./DragControls.js') || !mount.includes('mountPlacementDrag')) fail('开关分包没有延迟加载 DragControls')
      if (mount.includes('lostpointercapture') || mount.includes('matrixAutoUpdate') || mount.includes('dragPlacement')) {
        fail('开关分包把 DragControls 打进去了')
      }
      if (!live.includes('dragPlacement') || !live.includes('PlacementDrag') || !live.includes('DragDevice') || !live.includes('DragFurniture')) {
        fail('DragControls 分包里没有落点手柄')
      }
      if (!live.includes('lostpointercapture') || !live.includes('matrixAutoUpdate')) {
        fail('DragControls 分包里没有 drei DragControls / use-gesture')
      }
      if (!live.includes(indexImport) || !mount.includes(indexImport)) fail('拖摆分包没有复用入口包')
      const blob = `${mount}\n${live}`
      if (/from["']three["']/.test(blob) || blob.includes('WebGLRenderer') || blob.includes('PivotControls')) {
        fail('拖摆分包把 three 渲染器或 PivotControls 打进去了')
      }
      if (blob.includes('https://') || blob.includes('jsdelivr')) fail('拖摆分包带了外链')
      if (mount.length > 40_000 || live.length > 220_000) fail(`拖摆分包过大 mount=${mount.length} live=${live.length}`)
      bundle['assets/DragMount.js'] = asset('assets/DragMount.js', mount)
      bundle['assets/DragControls.js'] = asset('assets/DragControls.js', live)
      dock.code += `\nvoid import("./DragMount.js").then((m)=>{m.mountPlacementDrag()});\n`
    },
  }
}
