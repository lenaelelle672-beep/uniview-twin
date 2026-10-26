import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的导览轨接线摘掉。
 * drei CatmullRomLine 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 */
export const TOUR_PATH_SOURCE_BLOCK = `// T069：导览轨预览。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../tour-path/mount').then((mod) => {
  mod.mountTourPath()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/tour-path/mount.ts', import.meta.url))
const LINE_ENTRY = fileURLToPath(new URL('../src/tour-path/TourPathLine.tsx', import.meta.url))
const CURVE_FILE = fileURLToPath(new URL('../node_modules/three/src/extras/curves/CatmullRomCurve3.js', import.meta.url))
const LINES = fileURLToPath(new URL('../node_modules/three-stdlib/lines', import.meta.url))

const THREE_KEYS = [
  'ShaderMaterial',
  'UniformsUtils',
  'UniformsLib',
  'Vector2',
  'Vector3',
  'Vector4',
  'Color',
  'Mesh',
  'InstancedInterleavedBuffer',
  'InterleavedBufferAttribute',
  'Box3',
  'Sphere',
  'MathUtils',
  'Matrix4',
  'Line3',
  'InstancedBufferGeometry',
  'Float32BufferAttribute',
  'WireframeGeometry',
  'REVISION',
] as const

type ThreeKey = (typeof THREE_KEYS)[number]

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

function fail(message: string): never {
  throw new Error(`T069：${message}`)
}

function isChunk(item: { type: string }): item is BundleChunk {
  return item.type === 'chunk'
}

function chunksOf(bundle: Record<string, { type: string }>): BundleChunk[] {
  return Object.values(bundle).filter(isChunk)
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

function threeExports(indexCode: string): Record<ThreeKey, string> {
  const pattern = /__proto__\s*:\s*null,([\s\S]*?)\}\s*,\s*Symbol\.toStringTag/g
  let body: string | null = null
  for (const match of indexCode.matchAll(pattern)) {
    if (match[1].includes('ShaderMaterial:') && match[1].includes('Mesh:') && match[1].includes('UniformsLib:')) {
      body = match[1]
      break
    }
  }
  if (!body) fail('入口包里没有 three 的命名空间对象')
  const exported = exportMap(indexCode)
  const names = {} as Record<ThreeKey, string>
  for (const key of THREE_KEYS) {
    const found = body.match(new RegExp(`\\b${key}:([A-Za-z_$][\\w$]*)`))
    if (!found) fail(`three 命名空间缺少 ${key}`)
    const external = exported.get(found[1])
    if (!external) fail(`three.${key} 没有从入口包导出`)
    names[key] = external
  }
  return names
}

function fromIndex(indexFile: string): string {
  return JSON.stringify(`./${indexFile}`)
}

function reactShim(indexFile: string, react: string, jsx: string): string {
  const from = fromIndex(indexFile)
  return `import { ${react} as React, ${jsx} as runtime } from ${from}
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useRef = React.useRef
export const useCallback = React.useCallback
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const Fragment = React.Fragment
export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
`
}

function fiberShim(indexFile: string, useThree: string): string {
  const from = fromIndex(indexFile)
  return `import { ${useThree} as useThree } from ${from}
export { useThree }
`
}

function storeShim(indexFile: string, store: string): string {
  const from = fromIndex(indexFile)
  return `import { ${store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function coreShim(indexFile: string, names: Record<ThreeKey, string>): string {
  const from = fromIndex(indexFile)
  const spec = THREE_KEYS.map((key) => `${names[key]} as ${key}`).join(', ')
  return `import { ${spec} } from ${from}
export { ${THREE_KEYS.join(', ')} }
`
}

function threeShim(): string {
  return `export {
  ShaderMaterial,
  UniformsUtils,
  UniformsLib,
  Vector2,
  Vector3,
  Vector4,
  Color,
  Mesh,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Box3,
  Sphere,
  MathUtils,
  Matrix4,
  Line3,
  InstancedBufferGeometry,
  Float32BufferAttribute,
  WireframeGeometry,
  REVISION,
} from 'tour-three-core'
export { CatmullRomCurve3 } from ${JSON.stringify(CURVE_FILE)}
`
}

function linesShim(): string {
  return `export { Line2 } from ${JSON.stringify(`${LINES}/Line2.js`)}
export { LineSegments2 } from ${JSON.stringify(`${LINES}/LineSegments2.js`)}
export { LineMaterial } from ${JSON.stringify(`${LINES}/LineMaterial.js`)}
export { LineGeometry } from ${JSON.stringify(`${LINES}/LineGeometry.js`)}
export { LineSegmentsGeometry } from ${JSON.stringify(`${LINES}/LineSegmentsGeometry.js`)}
`
}

function shimPlugin(indexFile: string, react: string, jsx: string, useThree: string, store: string, three: Record<ThreeKey, string>, externalLine: boolean): EsbuildPlugin {
  return {
    name: 'tour-path-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (externalLine) {
        build.onResolve({ filter: /^\.\/TourPathLine(?:\.tsx)?$/ }, () => ({
          path: './TourPathLine.js',
          external: true,
        }))
        // 沿轨播放和导览轨开关共用 mount.ts。生产引导自己 import 播放分包，
        // 这里不能把 session 打进开关包。
        build.onResolve({ filter: /^\.\/session(?:\.tsx)?$/ }, () => ({
          path: './session.js',
          external: true,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'tour-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'tour-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'tour-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'tour-shim' }))
      build.onResolve({ filter: /^tour-three-core$/ }, () => ({ path: 'core', namespace: 'tour-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: 'lines', namespace: 'tour-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'tour-shim' }))
      const fromThreeSrc = (args: { path: string; resolveDir: string }) =>
        args.resolveDir.includes('/three/src/') || args.path.includes('/three/src/')
      build.onResolve({ filter: /Vector3\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'vec3', namespace: 'tour-math' } : undefined,
      )
      build.onResolve({ filter: /Vector2\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'vec2', namespace: 'tour-math' } : undefined,
      )
      build.onResolve({ filter: /Matrix4\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'mat4', namespace: 'tour-math' } : undefined,
      )
      build.onResolve({ filter: /MathUtils\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'math', namespace: 'tour-math' } : undefined,
      )
      build.onResolve({ filter: /utils\.js$/ }, (args) =>
        fromThreeSrc(args) && (args.path === '../../utils.js' || args.path.endsWith('/three/src/utils.js'))
          ? { path: 'utils', namespace: 'tour-math' }
          : undefined,
      )
      build.onLoad({ filter: /.*/, namespace: 'tour-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(indexFile, react, jsx)
            : args.path === 'jsx'
              ? `export { jsx, jsxs, Fragment } from 'react'\n`
              : args.path === 'fiber'
                ? fiberShim(indexFile, useThree)
                : args.path === 'three'
                  ? threeShim()
                  : args.path === 'core'
                    ? coreShim(indexFile, three)
                    : args.path === 'lines'
                      ? linesShim()
                      : storeShim(indexFile, store)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
      build.onLoad({ filter: /.*/, namespace: 'tour-math' }, (args) => {
        const contents =
          args.path === 'vec3'
            ? `export { Vector3 } from 'tour-three-core'\n`
            : args.path === 'vec2'
              ? `export { Vector2 } from 'tour-three-core'\n`
              : args.path === 'mat4'
                ? `export { Matrix4 } from 'tour-three-core'\n`
                : args.path === 'math'
                  ? `import { MathUtils } from 'tour-three-core'\nexport const clamp = MathUtils.clamp\nexport { MathUtils }\n`
                  : `export function warn() {}\n`
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  externalLine: boolean,
  indexFile: string,
  react: string,
  jsx: string,
  useThree: string,
  store: string,
  three: Record<ThreeKey, string>,
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
    write: false,
    jsx: 'automatic',
    plugins: [shimPlugin(indexFile, react, jsx, useThree, store, three, externalLine)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) fail('导览轨分包没有打成单个文件')
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

export function tourPathAfterHash(): Plugin {
  return {
    name: 'tour-path-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(TOUR_PATH_SOURCE_BLOCK)) {
        this.error('T069：dock 里的导览轨接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(TOUR_PATH_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T069：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      const leaked = /TourPath|tour-path|mountTourPath/
      if (leaked.test(index.code)) this.error('T069：导览轨被打进了入口包')
      if (leaked.test(fx.code)) this.error('T069：导览轨被打进了 balancedFx')
      if (leaked.test(loop.code)) this.error('T069：导览轨被打进了 DemandLoop')
      if (leaked.test(dock.code)) this.error('T069：哈希前的 dock 仍带着导览轨')
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const three = threeExports(index.code)
      // 压缩后整文件一行。http:// 里的 // 不能当成注释，否则两个地址会把后面的代码擦掉。
      const scrub = (source: string) => source.replace(/(?<!https?:)\/\/[^\n]*https?:\/\/[^\n]*/g, '')
      const mount = scrub(
        await bundleEntry(MOUNT_ENTRY, true, names.indexFile, names.react, names.jsx, names.useThree, names.store, three),
      )
      const line = scrub(
        await bundleEntry(LINE_ENTRY, false, names.indexFile, names.react, names.jsx, names.useThree, names.store, three),
      )
      if (/CatmullRom|isLineMaterial|instanceStart/.test(mount)) fail('开关分包把曲线打进去了')
      if (!mount.includes('./TourPathLine.js') || !mount.includes('mountTourPath')) fail('开关分包没有延迟加载曲线')
      if (!line.includes('isLineMaterial') || !line.includes('centripetal') || !line.includes('TourPath')) {
        fail('曲线分包里没有 drei CatmullRomLine')
      }
      if (line.includes('isVector3') || mount.includes('isVector3')) fail('导览轨分包把 three 又打了一份')
      if (!line.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        fail('导览轨分包没有复用入口包')
      }
      const blob = `${line}\n${mount}`
      const linkAt = blob.indexOf('https://')
      if (blob.includes('jsdelivr') || linkAt >= 0) {
        fail(`导览轨分包带了外链 ${blob.slice(Math.max(0, linkAt - 40), linkAt + 80)}`)
      }
      if (line.length > 180_000 || mount.length > 40_000) fail('导览轨分包把 three 整包打进去了')
      bundle['assets/TourPathMount.js'] = asset('assets/TourPathMount.js', mount)
      bundle['assets/TourPathLine.js'] = asset('assets/TourPathLine.js', line)
      dock.code += `\nvoid import("./TourPathMount.js").then((m)=>{m.mountTourPath()});\n`
    },
  }
}
