import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的拾取代理接线摘掉。
 * drei MeshDiscardMaterial 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和材质分包接回 dock。材质要等进层、首帧后 2600ms 才请求。
 */
export const DISCARD_PROXY_SOURCE_BLOCK = `// T115：拾取代理 MeshDiscardMaterial。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../discard-proxy/mount').then((mod) => {
  mod.mountDiscardProxy()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/discard-proxy/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/discard-proxy/DiscardProxy.tsx', import.meta.url))
const DREI_SHADER = fileURLToPath(new URL('../node_modules/@react-three/drei/core/shaderMaterial.js', import.meta.url))
const DREI_DISCARD = fileURLToPath(new URL('../node_modules/@react-three/drei/materials/DiscardMaterial.js', import.meta.url))
const DREI_MESH = fileURLToPath(new URL('../node_modules/@react-three/drei/core/MeshDiscardMaterial.js', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS =
  /discard-proxy|mountDiscardProxy|MeshDiscardMaterial|__twinDiscardProxy|meshDiscard|drei-MeshDiscardMaterial/

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

/** shaderMaterial 经 `THREE.` 用到的导出。MeshDiscardMaterial 本身不直接引用 three。 */
export function threeImportNames(): string[] {
  const names = new Set<string>()
  for (const file of [DREI_SHADER, DREI_DISCARD, DREI_MESH]) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
      if (match[1]) names.add(match[1])
    }
  }
  return [...names].sort()
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (missing.length > 0) throw new Error(`T115：入口包缺 three 导出 ${missing.join(', ')}`)
  const keys = Object.keys(found)
  if (keys.length === 0) throw new Error('T115：入口包没有可复用的 three 导出')
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
  return `import { ${names.extend} as extend, ${names.useThree} as useThree } from ${from}
export { extend, useThree }
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
    name: 'discard-proxy-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLive) {
        build.onResolve({ filter: /^\.\/DiscardProxy(?:\.tsx)?$/ }, () => ({
          path: './DiscardProxy.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'discard-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'discard-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'discard-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'discard-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'discard-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'discard-shim' }, (args) => {
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
    throw new Error(`T115：拾取代理分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T115：拾取代理分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T115：${label} 语法检查失败 ${result.stderr}`)
}

export function stripDiscardProxySource(code: string): string {
  if (!code.includes(DISCARD_PROXY_SOURCE_BLOCK)) {
    throw new Error('T115：dock 里的拾取代理接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(DISCARD_PROXY_SOURCE_BLOCK, '')
  if (next.includes('mountDiscardProxy') || next.includes('discard-proxy')) {
    throw new Error('T115：摘完 dock 仍留着拾取代理接线')
  }
  return next
}

export function discardProxyAfterHash(): Plugin {
  return {
    name: 'discard-proxy-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripDiscardProxySource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T115：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        if (GATE_MARKERS.test(chunk.code)) {
          this.error(`T115：MeshDiscardMaterial 被打进了 vite 分包 ${chunk.fileName}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T115：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, true, names, looked)
        live = await bundleEntry(LIVE_ENTRY, false, names, looked)
        assertSyntax(mount, 'DiscardProxyMount')
        assertSyntax(live, 'DiscardProxy')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T115：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./DiscardProxy.js') || !mount.includes('mountDiscardProxy')) {
        this.error('T115：开关分包没有延迟加载 MeshDiscardMaterial')
      }
      if (mount.includes('gl_FragColor') || mount.includes('discard;')) {
        this.error('T115：开关分包把 drei 的 discard 着色器打进去了')
      }
      if (!live.includes('gl_FragColor') || !live.includes('discard') || !live.includes('drei-MeshDiscardMaterial')) {
        this.error('T115：材质分包里没有 drei MeshDiscardMaterial')
      }
      if (!live.includes('colorWrite') || !live.includes('depthWrite')) {
        this.error('T115：材质分包没有关掉颜色和深度写入')
      }
      if (!live.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T115：拾取代理分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei/.test(mount + live)) {
        this.error('T115：拾取代理分包把 three 整包或 drei 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg/.test(mount + live)) {
        this.error('T115：拾取代理分包带了外链')
      }
      if (mount.length > 20_000 || live.length > 20_000) {
        this.error(`T115：拾取代理分包过大 mount=${mount.length} live=${live.length}`)
      }
      bundle['assets/DiscardProxyMount.js'] = asset('assets/DiscardProxyMount.js', mount)
      bundle['assets/DiscardProxy.js'] = asset('assets/DiscardProxy.js', live)
      dock.code += `\nvoid import("./DiscardProxyMount.js").then((m)=>{m.mountDiscardProxy()});\n`
    },
  }
}
