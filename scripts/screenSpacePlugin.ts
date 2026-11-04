import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的屏幕标注接线摘掉。
 * drei ScreenSpace 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和标注分包接回 dock。标注要等总览实景、首帧后 2600ms 才请求。
 */
export const SCREEN_MARK_SOURCE_BLOCK = `// T116：屏幕空间标注。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../screen-space/mount').then((mod) => {
  mod.mountScreenMark()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/screen-space/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/screen-space/ScreenMark.tsx', import.meta.url))
const DREI_SCREEN = fileURLToPath(new URL('../node_modules/@react-three/drei/core/ScreenSpace.js', import.meta.url))

/**
 * 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。
 * 不用单独的 screen-space：LineMaterial 的着色器注释里有 “screen-space conversion”。
 */
const GATE_MARKERS = /screen-space\/mount|mountScreenMark|__twinScreenMark|ScreenMark|core\/ScreenSpace|ScreenSizer/

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

/** 标注组件按名导入的 three，加上 drei ScreenSpace 经 `THREE.` 命名空间用到的。 */
export function threeImportNames(): string[] {
  const names = new Set<string>()
  const live = readFileSync(LIVE_ENTRY, 'utf8')
  for (const match of live.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g)) {
    if (match[1]) continue
    for (const part of (match[2] ?? '').split(',')) {
      const piece = part.trim()
      if (!piece || piece.startsWith('type ')) continue
      const name = piece.split(/\s+as\s+/)[0]?.trim()
      if (name) names.add(name)
    }
  }
  const drei = readFileSync(DREI_SCREEN, 'utf8')
  for (const match of drei.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1])
  }
  return [...names].sort()
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (missing.length > 0) throw new Error(`T116：入口包缺 three 导出 ${missing.join(', ')}`)
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T116：入口包没有可复用的 three 导出')
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}
export { ${keys.join(', ')} }
`
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

function fiberShim(indexFile: string, names: GridBindings): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame } from ${from}
export { useThree, useFrame }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function shimPlugin(
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
  externalLive: boolean,
): EsbuildPlugin {
  return {
    name: 'screen-mark-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/ScreenMark(?:\.tsx)?$/ }, () => ({
          path: './ScreenMark.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mark-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'mark-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'mark-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'mark-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'mark-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'mark-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names.react)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names.react, names.jsx)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? threeShim(names.indexFile, three.found, three.missing)
                  : storeShim(names.indexFile, names.store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  externalLive: boolean,
  names: GridBindings,
  three: { found: Record<string, string>; missing: string[] },
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
    charset: 'utf8',
    write: false,
    jsx: 'automatic',
    logLevel: 'silent',
    plugins: [shimPlugin(names, three, externalLive)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T116：屏幕标注分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T116：屏幕标注分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T116：${label} 语法检查失败 ${result.stderr}`)
}

export function stripScreenMarkSource(code: string): string {
  if (!code.includes(SCREEN_MARK_SOURCE_BLOCK)) {
    throw new Error('T116：dock 里的屏幕标注接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(SCREEN_MARK_SOURCE_BLOCK, '')
  if (next.includes('mountScreenMark') || next.includes('screen-space')) {
    throw new Error('T116：摘完 dock 仍留着屏幕标注接线')
  }
  return next
}

export function screenSpaceAfterHash(): Plugin {
  return {
    name: 'screen-space-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripScreenMarkSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T116：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = GATE_MARKERS.exec(chunk.code)
        if (hit) {
          const at = hit.index ?? 0
          const sample = chunk.code.slice(Math.max(0, at - 60), at + 80)
          this.error(`T116：屏幕标注被打进了 vite 分包 ${chunk.fileName}：${sample}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T116：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, true, names, looked)
        live = await bundleEntry(LIVE_ENTRY, false, names, looked)
        assertSyntax(mount, 'ScreenMarkMount')
        assertSyntax(live, 'ScreenMark')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T116：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./ScreenMark.js') || !mount.includes('mountScreenMark')) {
        this.error('T116：开关分包没有延迟加载标注')
      }
      if (mount.includes('position-z') || mount.includes('quaternion') || mount.includes('ScreenSizer')) {
        this.error('T116：开关分包把 drei ScreenSpace 打进去了')
      }
      if (!live.includes('position-z') || !live.includes('quaternion')) {
        this.error('T116：标注分包里没有 drei ScreenSpace')
      }
      if (live.includes('ScreenSizer') || live.includes('calculateScaleFactor') || live.includes('Billboard')) {
        this.error('T116：标注分包混进了 ScreenSizer 或 Billboard')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T116：标注分包没有复用入口包')
      }
      if (!live.includes(names.useFrame) || !live.includes(names.useThree)) {
        this.error('T116：标注分包没有复用入口包里的 useFrame / useThree')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei/.test(mount + live)) {
        this.error('T116：标注分包把 three 整包或 drei 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg/.test(mount + live)) {
        this.error('T116：标注分包带了外链')
      }
      if (mount.length > 20_000 || live.length > 20_000) {
        this.error(`T116：标注分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/ScreenMarkMount.js'] = asset('assets/ScreenMarkMount.js', mount)
      bundle['assets/ScreenMark.js'] = asset('assets/ScreenMark.js', live)
      dock.code += `\nvoid import("./ScreenMarkMount.js").then((m)=>{m.mountScreenMark()});\n`
    },
  }
}
