import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { stripShaderPreloadSource } from './shaderPreloadStrip'

/**
 * 哈希定稿前把 Scene 里的 Preload 接线摘掉，drei Preload 不进入口包。
 * 定稿后把开关分包和 Preload 分包接回 dock。dock 在首帧约 2600ms 之后才加载。
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/shader-preload/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/shader-preload/PreloadLayer.tsx', import.meta.url))
const THREE_FACADE = fileURLToPath(new URL('./shaderPreloadThree.mjs', import.meta.url))

const LEAKS = ['PreloadLayer', 'shader-preload', 'mountShaderPreload', 'preloadOn']

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function fail(message: string): never {
  throw new Error(`T090：${message}`)
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
export const createElement = React.createElement
export const Fragment = React.Fragment
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

function shimPlugin(names: GridBindings, externalLive: boolean): EsbuildPlugin {
  return {
    name: 'shader-preload-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'preload-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'preload-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'preload-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: THREE_FACADE }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/PreloadLayer(?:\.tsx)?$/ }, () => ({
          path: './PreloadLayer.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'preload-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : fiberShim(names.indexFile, names)
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
  if (!file || built.outputFiles.length !== 1) fail('Preload 分包没有打成单个文件')
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

export function shaderPreloadAfterHash(): Plugin {
  return {
    name: 'shader-preload-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/components/Scene.tsx')) return null
      return { code: stripShaderPreloadSource(code), map: null }
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
      if (LEAKS.some((leak) => dock.code.includes(leak))) fail('哈希前的 dock 仍带着 Preload')
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const mount = await bundleEntry(MOUNT_ENTRY, true, names)
      const live = await bundleEntry(LIVE_ENTRY, false, names)
      const indexImport = `./${names.indexFile}`
      if (!mount.includes('./PreloadLayer.js') || !mount.includes('mountShaderPreload')) {
        fail('开关分包没有延迟加载 PreloadLayer')
      }
      if (mount.includes('CubeCamera') || mount.includes('WebGLCubeRenderTarget')) {
        fail('开关分包把 CubeCamera 打进去了')
      }
      if (!live.includes('.compile(') || !live.includes('CubeCamera') || !live.includes('all:!0')) {
        fail('Preload 分包里没有 drei Preload')
      }
      if (!live.includes(indexImport) || !mount.includes(indexImport)) fail('Preload 分包没有复用入口包')
      if (/from["']three["']/.test(mount + live) || live.includes('class WebGLRenderer')) {
        fail('Preload 分包把 three 渲染器打进去了')
      }
      if ((mount + live).includes('https://') || (mount + live).includes('jsdelivr')) {
        fail('Preload 分包带了外链')
      }
      if (mount.length > 8_000 || live.length > 220_000) {
        fail(`Preload 分包过大 mount=${mount.length} live=${live.length}`)
      }
      const sceneSrc = readFileSync(fileURLToPath(new URL('../src/components/Scene.tsx', import.meta.url)), 'utf8')
      if (!sceneSrc.includes('<PreloadLayer />') || !sceneSrc.includes('BlankSuspenseFallback')) {
        fail('源码里的首屏 Suspense 接线丢了')
      }
      bundle['assets/ShaderPreload.js'] = asset('assets/ShaderPreload.js', mount)
      bundle['assets/PreloadLayer.js'] = asset('assets/PreloadLayer.js', live)
      dock.code += `\nvoid import("./ShaderPreload.js").then((m)=>{m.mountShaderPreload()});\n`
    },
  }
}
