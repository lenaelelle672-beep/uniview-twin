import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的浅拷接线摘掉，drei Clone 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和 Clone 分包接回 dock。
 */
export const CLONE_SOURCE_BLOCK = `// T077：GLTF 片段浅拷。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../fragment-clone/mount').then((mod) => {
  mod.mountFragmentClones()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/fragment-clone/mount.ts', import.meta.url))
const CLONE_ENTRY = fileURLToPath(new URL('../src/fragment-clone/FragmentClones.tsx', import.meta.url))
const SKELETON_UTILS = fileURLToPath(new URL('../node_modules/three-stdlib/utils/SkeletonUtils.js', import.meta.url))

const REQUIRED_THREE = ['Mesh', 'Group'] as const
const STUB_THREE = [
  'Vector3',
  'Quaternion',
  'Matrix4',
  'AnimationMixer',
  'VectorKeyframeTrack',
  'QuaternionKeyframeTrack',
  'AnimationClip',
  'SkeletonHelper',
] as const

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function fail(message: string): never {
  throw new Error(`T077：${message}`)
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
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const isValidElement = React.isValidElement || function () { return false }
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

function threeShim(indexFile: string, found: Record<string, string>): string {
  const from = fromIndex(indexFile)
  const spec = Object.entries(found)
    .map(([key, external]) => `${external} as ${key}`)
    .join(', ')
  const lines = [`import { ${spec} } from ${from}`, `export { ${Object.keys(found).join(', ')} }`]
  for (const name of STUB_THREE) {
    if (found[name]) continue
    lines.push(`export class ${name} {}`)
  }
  return `${lines.join('\n')}\n`
}

function shimPlugin(names: GridBindings, found: Record<string, string>, externalClone: boolean): EsbuildPlugin {
  return {
    name: 'clone-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'clone-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'clone-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'clone-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'clone-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: SKELETON_UTILS }))
      if (externalClone) {
        build.onResolve({ filter: /^\.\/FragmentClones(?:\.tsx)?$/ }, () => ({
          path: './FragmentClones.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'clone-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : threeShim(names.indexFile, found)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(entry: string, externalClone: boolean, names: GridBindings, found: Record<string, string>): Promise<string> {
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
    plugins: [shimPlugin(names, found, externalClone)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) fail('浅拷分包没有打成单个文件')
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

export function cloneAfterHash(): Plugin {
  return {
    name: 'clone-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(CLONE_SOURCE_BLOCK)) {
        this.error('T077：dock 里的浅拷接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(CLONE_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) fail('找不到入口包、dock、DemandLoop 或 balancedFx')
      const leaked = /fragment-clone|FragmentClones|mountFragmentClones|core\/Clone/
      if (leaked.test(index.code)) fail('浅拷被打进了入口包')
      if (leaked.test(fx.code) || /hls\.js|useVideoTexture/.test(fx.code)) fail('浅拷被打进了 balancedFx')
      if (leaked.test(loop.code)) fail('浅拷被打进了 DemandLoop')
      if (leaked.test(dock.code)) fail('哈希前的 dock 仍带着浅拷')
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const looked = lookupThreeExports(index.code, [...REQUIRED_THREE, ...STUB_THREE])
      const absent = REQUIRED_THREE.filter((key) => !looked.found[key])
      if (absent.length > 0) fail(`入口包缺少 three 导出 ${absent.join(', ')}`)
      const scrub = (source: string) => source.replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '')
      const mount = scrub(await bundleEntry(MOUNT_ENTRY, true, names, looked.found))
      const clones = scrub(await bundleEntry(CLONE_ENTRY, false, names, looked.found))
      if (mount.includes('materialsOnly') || mount.includes('isSkinnedMesh')) fail('开关分包把 Clone 打进去了')
      if (!mount.includes('./FragmentClones.js') || !mount.includes('mountFragmentClones')) fail('开关分包没有延迟加载 Clone')
      if (!clones.includes('materialsOnly') || !clones.includes('isSkinnedMesh')) fail('Clone 分包里没有 drei Clone')
      if (!clones.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) fail('浅拷分包没有复用入口包')
      if (/from ["']three["']/.test(clones) || /from ["']three["']/.test(mount)) fail('浅拷分包把 three 又打了一份')
      if (clones.includes('WebGLRenderer') || mount.includes('WebGLRenderer')) fail('浅拷分包把 three 渲染器打进去了')
      if (/hls\.js|useVideoTexture|FogExp2/.test(`${clones}\n${mount}`)) fail('浅拷分包带上了无关功能')
      const linkAt = `${clones}\n${mount}`.indexOf('https://')
      if (clones.includes('jsdelivr') || mount.includes('jsdelivr') || linkAt >= 0) {
        const blob = `${clones}\n${mount}`
        fail(`浅拷分包带了外链 ${blob.slice(Math.max(0, linkAt - 40), linkAt + 80)}`)
      }
      if (clones.length > 200_000 || mount.length > 40_000) {
        fail(`浅拷分包过大 mount=${mount.length} clones=${clones.length}`)
      }
      bundle['assets/CloneMount.js'] = asset('assets/CloneMount.js', mount)
      bundle['assets/FragmentClones.js'] = asset('assets/FragmentClones.js', clones)
      dock.code += `\nvoid import("./CloneMount.js").then((m)=>{m.mountFragmentClones()});\n`
    },
  }
}
