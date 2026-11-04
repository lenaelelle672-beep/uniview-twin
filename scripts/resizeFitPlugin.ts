import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的缩放接线摘掉。
 * drei Resize 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包接回 dock。Resize 本身要等打开并且只剩一枚选中件才请求。
 */
export const RESIZE_FIT_SOURCE_BLOCK = `// T117：选中件 Resize 视口适配。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../resize-fit/mount').then((mod) => {
  mod.mountResizeFit()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/resize-fit/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/resize-fit/ResizeFit.tsx', import.meta.url))

/** 入口包、balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。不用裸的 Resize，免得撞上 ResizeObserver。 */
const GATE_MARKERS = /resize-fit|mountResizeFit|ResizeFit|__twinResizeFit|drei\/core\/Resize/

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

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
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
export const version = React.version
`
}

function jsxShim(indexFile: string, react: string, jsx: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${jsx} as runtime, ${react} as React } from ${from}
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = React.Fragment
`
}

function fiberShim(indexFile: string, useThree: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${useThree} as useThree } from ${from}
export { useThree }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

/** Box3 走 three 叶子，不从入口包再要一个导出，也避免整包 three。 */
function threeShim(): string {
  return `export { Box3 } from 'three/src/math/Box3.js'\n`
}

function shimPlugin(names: GridBindings, externalLive: boolean): EsbuildPlugin {
  return {
    name: 'resize-fit-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/ResizeFit(?:\.tsx)?$/ }, () => ({
          path: './ResizeFit.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'resize-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'resize-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'resize-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'resize-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'resize-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'resize-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names.useThree)
                : args.path === 'three'
                  ? threeShim()
                  : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
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
    charset: 'utf8',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [shimPlugin(names, externalLive)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T117：缩放分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T117：缩放分包没有打成单个文件')
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

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T117：${label} 语法检查失败 ${result.stderr}`)
}

export function stripResizeFitSource(code: string): string {
  if (!code.includes(RESIZE_FIT_SOURCE_BLOCK)) {
    throw new Error('T117：dock 里的缩放接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(RESIZE_FIT_SOURCE_BLOCK, '')
  if (next.includes('mountResizeFit') || next.includes('resize-fit')) {
    throw new Error('T117：摘完 dock 仍留着缩放接线')
  }
  return next
}

const FORBIDDEN = /<Html|from"@react-three\/drei\/web\/Html|instanceMatrix|setMatrixAt|setLookAt|fitToBox|useFrame|WebGLRenderer|class WebGLRenderer/

export function resizeFitAfterHash(): Plugin {
  return {
    name: 'resize-fit-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripResizeFitSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T117：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        if (GATE_MARKERS.test(chunk.code)) {
          this.error(`T117：缩放被打进了 vite 分包 ${chunk.fileName}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T117：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      let mount = ''
      let live = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, true, names)
        live = await bundleEntry(LIVE_ENTRY, false, names)
        assertSyntax(mount, 'ResizeFitMount')
        assertSyntax(live, 'ResizeFit')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T117：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./ResizeFit.js') || !mount.includes('mountResizeFit')) {
        this.error('T117：开关分包没有延迟加载 Resize')
      }
      if (mount.includes('setFromObject') || mount.includes('setScalar')) {
        this.error('T117：开关分包把 drei Resize 打进去了')
      }
      if (!live.includes('setFromObject') || !live.includes('setScalar') || !live.includes('ResizeFitCarrier')) {
        this.error('T117：载体分包里没有 drei Resize')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T117：缩放分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|@react-three\/drei["']/.test(mount + live)) {
        this.error('T117：缩放分包把 three 整包或 drei 入口打进去了')
      }
      if (FORBIDDEN.test(mount + live)) {
        this.error('T117：缩放分包碰了 Html、实例矩阵、飞镜头或 useFrame')
      }
      if (mount.length > 40_000 || live.length > 220_000) {
        this.error(`T117：缩放分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/ResizeFitMount.js'] = asset('assets/ResizeFitMount.js', mount)
      bundle['assets/ResizeFit.js'] = asset('assets/ResizeFit.js', live)
      dock.code += `\nvoid import("./ResizeFitMount.js").then((m)=>{m.mountResizeFit()});\n`
    },
  }
}
