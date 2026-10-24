import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * 和 T059 同一手法：哈希定稿前把 dock 里的接线摘掉，
 * 入口包文件名保持不变；定稿后再把作者分包接回 dock。
 * 面光和 LTC 贴图不进 vite 图，所以不会带动 index / balancedFx 的字节。
 */
export const RECT_AREA_SOURCE_BLOCK = `// T068：面光。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../author-lights/mount').then((mod) => {
  mod.mountRectAreaLights()
})
`

/**
 * 生产包尾部的引导。先看 ?demoEdit=1，观众地址不发请求。
 * 规则和 demoEditActive 一样：当前地址或启动 navigation 里 demoEdit 必须正好是 1。
 */
export const RECT_AREA_DOCK_BOOT = `;(function(){try{var ok=new URLSearchParams(location.search).get("demoEdit")==="1";if(!ok){var n=performance.getEntriesByType("navigation")[0];ok=!!(n&&n.name&&new URL(n.name,"http://localhost").searchParams.get("demoEdit")==="1")}if(ok)void import("./RectAreaMount.js").then(function(m){m.mountRectAreaLights()})}catch(e){}})();`

/** 这些符号已经从入口包导出。面光分包复用它们，不再打一份。 */
export const RECT_AREA_SHARED_KEYS = [
  'UniformsLib',
  'Mesh',
  'BufferGeometry',
  'Float32BufferAttribute',
  'MeshBasicMaterial',
  'BackSide',
  'DataTexture',
  'FloatType',
  'HalfFloatType',
  'LinearFilter',
  'NearestFilter',
  'RGBAFormat',
  'ClampToEdgeWrapping',
] as const

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/author-lights/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/author-lights/live.ts', import.meta.url))
const LEAVES_ENTRY = fileURLToPath(new URL('../src/author-lights/threeLeaves.ts', import.meta.url))

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

function fail(message: string): never {
  throw new Error(`T068：${message}`)
}

function exportMap(indexCode: string): Map<string, string> {
  const tail = indexCode.slice(indexCode.lastIndexOf('export{'))
  const map = new Map<string, string>()
  for (const match of tail.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    map.set(match[1], match[2])
  }
  if (map.size === 0) fail('入口包没有导出表')
  return map
}

function threeNamespace(indexCode: string): string {
  const pattern = /__proto__\s*:\s*null,([\s\S]*?)\}\s*,\s*Symbol\.toStringTag/g
  for (const match of indexCode.matchAll(pattern)) {
    if (match[1].includes('UniformsLib:') && match[1].includes('RectAreaLight:')) return match[1]
  }
  fail('入口包里没有 three 的命名空间对象')
}

export function discoverRectAreaShared(indexCode: string): { uniformsLocal: string; exports: Record<string, string> } {
  const body = threeNamespace(indexCode)
  const exportedByLocal = exportMap(indexCode)
  const exports: Record<string, string> = {}
  let uniformsLocal = ''
  for (const key of RECT_AREA_SHARED_KEYS) {
    const found = body.match(new RegExp(`\\b${key}:([A-Za-z_$][\\w$]*)`))
    if (!found) fail(`three 命名空间缺少 ${key}`)
    const exported = exportedByLocal.get(found[1])
    if (!exported) fail(`${key} 没有从入口包导出，不能改入口包去补这个名字`)
    exports[key] = exported
    if (key === 'UniformsLib') uniformsLocal = found[1]
  }
  const reader = indexCode.match(/rectAreaLTC1=([A-Za-z_$][\w$]*)\.LTC_FLOAT_1/)
  if (!reader || reader[1] !== uniformsLocal) fail('渲染器读的 UniformsLib 和命名空间不是同一份')
  return { uniformsLocal, exports }
}

function shimSource(indexFile: string, exports: Record<string, string>): string {
  const shared = RECT_AREA_SHARED_KEYS.map((key) => `${exports[key]} as ${key}`).join(',')
  return `export { ${shared} } from "./${indexFile}"
export { RectAreaLight, Line, LineBasicMaterial, DataUtils, UVMapping } from ${JSON.stringify(LEAVES_ENTRY)}
`
}

function shimPlugin(indexFile: string, exports: Record<string, string>): EsbuildPlugin {
  return {
    name: 'rect-area-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^\.\/live$/ }, () => ({
        path: './RectAreaLive.js',
        external: true,
      }))
      build.onResolve({ filter: /^three$/ }, () => ({
        path: 'three',
        namespace: 'rect-area-shim',
      }))
      build.onLoad({ filter: /.*/, namespace: 'rect-area-shim' }, () => ({
        contents: shimSource(indexFile, exports),
        loader: 'js',
        resolveDir: ROOT,
      }))
    },
  }
}

async function bundleEntry(entry: string, indexFile: string, exports: Record<string, string>): Promise<string> {
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
    plugins: [shimPlugin(indexFile, exports)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) fail('面光分包没有打成单个文件')
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

export function rectAreaAfterHash(): Plugin {
  return {
    name: 'rect-area-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(RECT_AREA_SOURCE_BLOCK)) {
        this.error('T068：dock 里的面光接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(RECT_AREA_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock) {
        this.error('T068：找不到入口包或 dock')
        return
      }
      if (/RectAreaLightHelper|RectAreaLightUniformsLib|author-lights|RectAreaMount|mountRectAreaLights|LTC_MAT_1/.test(index.code)) {
        this.error('T068：面光被打进了入口包')
      }
      if (fx && /RectAreaLightHelper|RectAreaLightUniformsLib|author-lights|LTC_MAT_1/.test(fx.code)) {
        this.error('T068：面光被打进了 balancedFx')
      }
      if (/author-lights|RectAreaMount|mountRectAreaLights/.test(dock.code)) {
        this.error('T068：哈希前的 dock 仍带着面光')
      }
      const indexFile = index.fileName.slice('assets/'.length)
      const shared = discoverRectAreaShared(index.code)
      const mount = await bundleEntry(MOUNT_ENTRY, indexFile, shared.exports)
      const live = await bundleEntry(LIVE_ENTRY, indexFile, shared.exports)
      const mountLeak = mount.match(/LTC_FLOAT_1|three\/examples|UniformsLib\.init|from"three"|from'three'|LTC_MAT_1|isRectAreaLight/)
      if (mountLeak) {
        this.error(`T068：开关分包把面光或 three 打进去了 (${mountLeak[0]})`)
      }
      if (!mount.includes('./RectAreaLive.js')) this.error('T068：开关分包没有延迟加载面光')
      if (!live.includes('RectAreaLightHelper') || !live.includes('.LTC_FLOAT_1')) {
        this.error('T068：面光分包里没有 Helper 或 LTC 贴图')
      }
      if (!live.includes(`./${indexFile}`) || !live.includes(shared.exports.UniformsLib)) {
        this.error('T068：面光分包没有复用入口包里的 UniformsLib')
      }
      if (live.includes('isWebGLRenderer') || mount.length > 30_000 || live.length > 900_000) {
        this.error('T068：面光分包把渲染器整包打进去了')
      }
      bundle['assets/RectAreaMount.js'] = asset('assets/RectAreaMount.js', mount)
      bundle['assets/RectAreaLive.js'] = asset('assets/RectAreaLive.js', live)
      dock.code += `\n${RECT_AREA_DOCK_BOOT}\n`
    },
  }
}
