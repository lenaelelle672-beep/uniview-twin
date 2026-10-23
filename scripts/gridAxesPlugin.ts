import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 和 T054 同一手法：哈希定稿前把 dock 里的接线摘掉，
 * 入口包文件名保持不变；定稿后再把独立分包接回 dock。
 * drei Grid 不进 vite 图，所以不会带动 DemandLoop / dock / index 的哈希。
 */
export const GRID_SOURCE_BLOCK = `// T059：网格和坐标轴。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../grid/mount').then((mod) => {
  mod.mountGridAxes()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/grid/mount.ts', import.meta.url))
const AXES_ENTRY = fileURLToPath(new URL('../src/grid/GridAxes.tsx', import.meta.url))

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

function threeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  const three = names.three
  const spec = [
    `${three.Color} as Color`,
    `${three.Vector3} as Vector3`,
    `${three.Plane} as Plane`,
    `${three.ShaderMaterial} as ShaderMaterial`,
    `${three.MathUtils} as MathUtils`,
    `${three.BackSide} as BackSide`,
    `${three.DoubleSide} as DoubleSide`,
    `${three.REVISION} as REVISION`,
    `${three.Uniform} as Uniform`,
    `${three.UniformsUtils} as UniformsUtils`,
  ].join(', ')
  return `import { ${spec} } from ${from}
export { Color, Vector3, Plane, ShaderMaterial, MathUtils, BackSide, DoubleSide, REVISION, Uniform, UniformsUtils }
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(names: GridBindings, externalAxes: boolean): EsbuildPlugin {
  return {
    name: 'grid-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'grid-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'grid-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'grid-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'grid-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'grid-shim' }))
      if (externalAxes) {
        build.onResolve({ filter: /^\.\/GridAxes(?:\.tsx)?$/ }, () => ({
          path: './GridAxes.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'grid-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? threeShim(names.indexFile, names)
                  : storeShim(names.indexFile, names)
        return { contents, loader: 'js' }
      })
    },
  }
}

async function bundleGridEntry(entry: string, externalAxes: boolean, names: GridBindings): Promise<string> {
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
    plugins: [shimPlugin(names, externalAxes)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) {
    throw new Error('T059：格网分包没有打成单个文件')
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

export function gridAxesAfterHash(): Plugin {
  return {
    name: 'grid-axes-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(GRID_SOURCE_BLOCK)) {
        this.error('T059：dock 里的网格接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(GRID_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      if (!index || !dock || !loop) {
        this.error('T059：找不到入口包、dock 或 DemandLoop')
        return
      }
      if (index.code.includes('GridMount') || index.code.includes('GridAxes') || index.code.includes('grid/mount')) {
        this.error('T059：格网被打进了入口包')
      }
      if (dock.code.includes('grid/mount') || dock.code.includes('GridAxes')) {
        this.error('T059：哈希前的 dock 仍带着格网')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const mount = await bundleGridEntry(MOUNT_ENTRY, true, names)
      const axes = await bundleGridEntry(AXES_ENTRY, false, names)
      if (mount.includes('gridMaterial') || mount.includes('axesHelper') || mount.includes('ShaderMaterial')) {
        this.error('T059：开关分包把 Grid 打进去了')
      }
      if (!mount.includes('./GridAxes.js')) this.error('T059：开关分包没有延迟加载 Grid')
      if (!axes.includes('gridMaterial') || !axes.includes('axesHelper')) {
        this.error('T059：Grid 分包里没有 drei Grid 或 axesHelper')
      }
      if (!axes.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T059：格网分包没有复用入口包')
      }
      if (axes.length > 200_000 || mount.length > 80_000) {
        this.error('T059：格网分包把 three 整包打进去了')
      }
      bundle['assets/GridMount.js'] = asset('assets/GridMount.js', mount)
      bundle['assets/GridAxes.js'] = asset('assets/GridAxes.js', axes)
      dock.code += `\nvoid import("./GridMount.js").then((m)=>{m.mountGridAxes()});\n`
    },
  }
}
