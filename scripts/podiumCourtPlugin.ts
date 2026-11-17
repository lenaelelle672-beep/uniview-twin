import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的 T134 接线摘掉。
 * 屋顶草与庭院细部不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和细部分包接回 dock。细部要等首帧后 2600ms 才请求。
 */
export const PODIUM_COURT_SOURCE_BLOCK = `// T134：裙房屋顶绿化与下沉庭院细部。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../podium-court/mount').then((mod) => {
  mod.mountPodiumCourt()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/podium-court/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/podium-court/PodiumCourtDetail.tsx', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS = /podium-court|mountPodiumCourt|PodiumCourtDetail|__twinPodiumCourt/

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

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame } from ${from}
export { useThree, useFrame }
`
}

function shimPlugin(names: GridBindings, externalLive: boolean): EsbuildPlugin {
  return {
    name: 'podium-court-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/PodiumCourtDetail(?:\.tsx)?$/ }, () => ({
          path: './PodiumCourtDetail.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'court-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'court-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'court-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'court-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : fiberShim(names.indexFile, names)
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
    throw new Error(`T134：庭院分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T134：庭院分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T134：${label} 语法检查失败 ${result.stderr}`)
}

export function stripPodiumCourtSource(code: string): string {
  if (!code.includes(PODIUM_COURT_SOURCE_BLOCK)) {
    throw new Error('T134：dock 里的庭院接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(PODIUM_COURT_SOURCE_BLOCK, '')
  if (next.includes('mountPodiumCourt') || next.includes('podium-court')) {
    throw new Error('T134：摘完 dock 仍留着庭院接线')
  }
  return next
}

export function podiumCourtAfterHash(): Plugin {
  return {
    name: 'podium-court-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripPodiumCourtSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T134：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        if (GATE_MARKERS.test(chunk.code)) {
          this.error(`T134：庭院细部被打进了 vite 分包 ${chunk.fileName}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T134：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      let mount = ''
      let live = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, true, names)
        live = await bundleEntry(LIVE_ENTRY, false, names)
        assertSyntax(mount, 'PodiumCourtMount')
        assertSyntax(live, 'PodiumCourtDetail')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T134：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./PodiumCourtDetail.js') || !mount.includes('mountPodiumCourt')) {
        this.error('T134：开关分包没有延迟加载庭院细部')
      }
      if (live.includes('makeBasin(') || live.includes('COURT_SLOPE_M')) {
        this.error('T134：细部分包重挖了下沉盆')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T134：庭院分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei/.test(mount + live)) {
        this.error('T134：庭院分包把 three 整包或 drei 入口打进去了')
      }
      if (/MeshReflector|transmission|SSGI|pathtracer|useLoader\.preload/.test(mount + live)) {
        this.error('T134：庭院分包用了禁栈')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b/.test(mount + live)) {
        this.error('T134：庭院分包带了外链或 HDR')
      }
      if (mount.length > 20_000 || live.length > 80_000) {
        this.error(`T134：庭院分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/PodiumCourtMount.js'] = asset('assets/PodiumCourtMount.js', mount)
      bundle['assets/PodiumCourtDetail.js'] = asset('assets/PodiumCourtDetail.js', live)
      dock.code += `\nvoid import("./PodiumCourtMount.js").then((m)=>{m.mountPodiumCourt()});\n`
    },
  }
}
