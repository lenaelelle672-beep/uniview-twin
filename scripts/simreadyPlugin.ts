import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings } from '../src/grid/bindings'

/**
 * T103：哈希定稿前把 dock 里的 SimReady 接线摘掉。
 * GLB、MeshoptDecoder 和署名不进 vite 图，不带动 index / balancedFx / dock 的哈希。
 * 定稿后再把独立分包接回 dock。dock 自己在首帧约 2600ms 之后才加载。
 */
export const SIMREADY_SOURCE_BLOCK = `// T103：SimReady 试吃。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../simready/mount').then((mod) => {
  mod.mountSimReady()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/simready/mount.ts', import.meta.url))

const LEAKS = /mountSimReady|simready\/mount|SimReadyTaste\.js|nvidia\/simready-assets/

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

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const createElement = React.createElement
export const Fragment = React.Fragment
`
}

function shimPlugin(indexFile: string, react: string): EsbuildPlugin {
  return {
    name: 'simready-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'simready-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'simready-shim' }, () => ({
        contents: reactShim(indexFile, react),
        loader: 'js',
        resolveDir: ROOT,
      }))
    },
  }
}

export function simreadyAfterHash(): Plugin {
  return {
    name: 'simready-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(SIMREADY_SOURCE_BLOCK)) {
        this.error('T103：dock 里的 SimReady 接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(SIMREADY_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx' || item.fileName.includes('balancedFx'))
      if (!index || !dock || !loop || !fx) {
        this.error('T103：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of [index, dock, loop, fx]) {
        if (LEAKS.test(chunk.code)) this.error(`T103：SimReady 被打进了 ${chunk.fileName}`)
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
        plugins: [shimPlugin(names.indexFile, names.react)],
      })
      const source = built.outputFiles[0]?.text ?? ''
      if (
        built.outputFiles.length !== 1 ||
        !source.includes('mountSimReady') ||
        !source.includes('setMeshoptDecoder') ||
        !source.includes('decodeGltfBuffer') ||
        !source.includes('EXT_texture_webp') ||
        !source.includes('NVIDIA') ||
        !source.includes('nvidia/simready-assets') ||
        !source.includes('community convert') ||
        !source.includes(`./${names.indexFile}`) ||
        source.length > 1_600_000 ||
        /balancedFx|station-explode|DemandLoop|FogExp2|from"three"|from'three'|react-dom/i.test(source)
      ) {
        this.error('T103：试吃分包没有把 MeshoptDecoder 和署名独立打出来')
      }
      bundle['assets/SimReadyTaste.js'] = asset('assets/SimReadyTaste.js', source)
      dock.code += `\nvoid import("./SimReadyTaste.js").then((m)=>{m.mountSimReady()});\n`
    },
  }
}
