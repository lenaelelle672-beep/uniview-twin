import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的天幕接线摘掉。
 * drei GradientTexture 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和天幕分包接回 dock。天幕要等昼间总览、首帧后 2600ms 才请求。
 */
export const GRADIENT_SKY_SOURCE_BLOCK = `// T114：渐变天幕。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../gradient-sky/mount').then((mod) => {
  mod.mountGradientSky()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/gradient-sky/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/gradient-sky/GradientSky.tsx', import.meta.url))
const DREI_GRADIENT = fileURLToPath(new URL('../node_modules/@react-three/drei/core/GradientTexture.js', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS = /gradient-sky|mountGradientSky|GradientSky|__twinGradientSky|skyGradient/

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

/** 天幕组件按名导入的 three，加上 drei GradientTexture 经 `THREE.` 命名空间用到的。 */
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
  const drei = readFileSync(DREI_GRADIENT, 'utf8')
  for (const match of drei.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1])
  }
  return [...names].sort()
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (missing.length > 0) throw new Error(`T114：入口包缺 three 导出 ${missing.join(', ')}`)
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T114：入口包没有可复用的 three 导出')
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
  return `import { ${names.useThree} as useThree } from ${from}
export { useThree }
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
    name: 'gradient-sky-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/GradientSky(?:\.tsx)?$/ }, () => ({
          path: './GradientSky.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'sky-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'sky-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'sky-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'sky-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'sky-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'sky-shim' }, (args) => {
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
    throw new Error(`T114：天幕分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T114：天幕分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T114：${label} 语法检查失败 ${result.stderr}`)
}

export function stripGradientSkySource(code: string): string {
  if (!code.includes(GRADIENT_SKY_SOURCE_BLOCK)) {
    throw new Error('T114：dock 里的天幕接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(GRADIENT_SKY_SOURCE_BLOCK, '')
  if (next.includes('mountGradientSky') || next.includes('gradient-sky')) {
    throw new Error('T114：摘完 dock 仍留着天幕接线')
  }
  return next
}

export function gradientSkyAfterHash(): Plugin {
  return {
    name: 'gradient-sky-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripGradientSkySource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T114：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        if (GATE_MARKERS.test(chunk.code)) {
          this.error(`T114：天幕被打进了 vite 分包 ${chunk.fileName}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T114：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, true, names, looked)
        live = await bundleEntry(LIVE_ENTRY, false, names, looked)
        assertSyntax(mount, 'GradientSkyMount')
        assertSyntax(live, 'GradientSky')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T114：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./GradientSky.js') || !mount.includes('mountGradientSky')) {
        this.error('T114：开关分包没有延迟加载天幕')
      }
      if (mount.includes('createLinearGradient') || mount.includes('canvasTexture')) {
        this.error('T114：开关分包把 drei GradientTexture 打进去了')
      }
      if (!live.includes('createLinearGradient') || !live.includes('canvasTexture')) {
        this.error('T114：天幕分包里没有 drei GradientTexture')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T114：天幕分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei/.test(mount + live)) {
        this.error('T114：天幕分包把 three 整包或 drei 入口打进去了')
      }
      if (/\bpreset\b|HDRLoader|RGBELoader|EXRLoader|PMREMGenerator|\.environment=|\.background=/.test(mount + live)) {
        this.error('T114：天幕分包碰了 Environment、HDR 或 scene.background')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b/.test(mount + live)) {
        this.error('T114：天幕分包带了外链或 HDR')
      }
      if (mount.length > 20_000 || live.length > 20_000) {
        this.error(`T114：天幕分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/GradientSkyMount.js'] = asset('assets/GradientSkyMount.js', mount)
      bundle['assets/GradientSky.js'] = asset('assets/GradientSky.js', live)
      dock.code += `\nvoid import("./GradientSkyMount.js").then((m)=>{m.mountGradientSky()});\n`
    },
  }
}
