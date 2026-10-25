import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'

/**
 * 哈希定稿前把 dock 里的接线摘掉，drei Segments 不进 vite 图，
 * 所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包和 Segments 分包接回 dock。
 */
export const SEGMENTS_SOURCE_BLOCK = `// T072：Segments 批辅线。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../segments/mount').then((mod) => {
  mod.mountBatchSegments()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/segments/mount.ts', import.meta.url))
const SEGMENTS_ENTRY = fileURLToPath(new URL('../src/segments/BatchSegments.tsx', import.meta.url))
const THREE_SRC = fileURLToPath(new URL('../node_modules/three/src/', import.meta.url))
const LINE2 = fileURLToPath(new URL('../node_modules/three-stdlib/lines/Line2.js', import.meta.url))
const LINE_MATERIAL = fileURLToPath(new URL('../node_modules/three-stdlib/lines/LineMaterial.js', import.meta.url))
const LINE_SEGMENTS_GEOMETRY = fileURLToPath(
  new URL('../node_modules/three-stdlib/lines/LineSegmentsGeometry.js', import.meta.url),
)

/** 这些类必须和入口包是同一份，否则材质、颜色和 Mesh 对不上。 */
const REQUIRED_THREE = [
  'Mesh',
  'ShaderMaterial',
  'UniformsUtils',
  'UniformsLib',
  'Color',
  'Vector2',
  'Vector3',
  'REVISION',
  'MathUtils',
  'BufferGeometry',
  'Float32BufferAttribute',
] as const

const ALL_THREE = [
  ...REQUIRED_THREE,
  'Matrix4',
  'Vector4',
  'Box3',
  'Sphere',
  'Line3',
  'InstancedBufferGeometry',
  'InstancedInterleavedBuffer',
  'InterleavedBufferAttribute',
  'WireframeGeometry',
] as const

const SRC_FALLBACK: Record<string, string> = {
  InstancedInterleavedBuffer: 'core/InstancedInterleavedBuffer.js',
  InterleavedBufferAttribute: 'core/InterleavedBufferAttribute.js',
}

interface BundleChunk {
  type: string
  name: string
  fileName: string
  code: string
}

export function lookupThreeExports(indexCode: string, keys: readonly string[]): { found: Record<string, string>; missing: string[] } {
  const bodies: string[] = []
  const pattern = /__proto__\s*:\s*null,([\s\S]*?)\}\s*,\s*Symbol\.toStringTag/g
  for (const match of indexCode.matchAll(pattern)) bodies.push(match[1] ?? '')
  const tail = indexCode.slice(indexCode.lastIndexOf('export{'))
  const exported = new Map<string, string>()
  for (const match of tail.matchAll(/([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)/g)) {
    exported.set(match[1] ?? '', match[2] ?? '')
  }
  const found: Record<string, string> = {}
  const missing: string[] = []
  for (const key of keys) {
    let local = ''
    for (const body of bodies) {
      const hit = body.match(new RegExp(`\\b${key}:([A-Za-z_$][\\w$]*)`))
      if (hit?.[1]) {
        local = hit[1]
        break
      }
    }
    const external = local ? exported.get(local) : undefined
    if (!external) missing.push(key)
    else found[key] = external
  }
  return { found, missing }
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

function inlineStub(name: string): string {
  if (name === 'InstancedBufferGeometry') {
    return `export class InstancedBufferGeometry extends BufferGeometry {
  constructor() {
    super()
    this.isInstancedBufferGeometry = true
    this.type = 'InstancedBufferGeometry'
    this.instanceCount = Infinity
  }
  copy(source) {
    super.copy(source)
    this.instanceCount = source.instanceCount
    return this
  }
}`
  }
  if (name === 'WireframeGeometry') {
    return `export class WireframeGeometry {
  constructor() {
    throw new Error('批线不走 WireframeGeometry')
  }
}`
  }
  if (name === 'Vector4') {
    return `export class Vector4 {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x
    this.y = y
    this.z = z
    this.w = w
  }
  set(x, y, z, w) {
    this.x = x
    this.y = y
    this.z = z
    this.w = w
    return this
  }
  copy(other) {
    this.x = other.x
    this.y = other.y
    this.z = other.z
    this.w = other.w
    return this
  }
}`
  }
  if (name === 'Matrix4') {
    return `export class Matrix4 {
  constructor() {
    this.elements = new Float32Array(16)
  }
  copy() {
    return this
  }
  multiplyMatrices() {
    return this
  }
}`
  }
  if (name === 'Box3') {
    return `export class Box3 {
  constructor() {
    this.isBox3 = true
  }
  copy() {
    return this
  }
  applyMatrix4() {
    return this
  }
  expandByScalar() {
    return this
  }
}`
  }
  if (name === 'Sphere') {
    return `export class Sphere {
  constructor(center = null, radius = 0) {
    this.center = center
    this.radius = radius
  }
  copy(other) {
    this.center = other.center
    this.radius = other.radius
    return this
  }
  applyMatrix4() {
    return this
  }
}`
  }
  if (name === 'Line3') {
    return `export class Line3 {
  constructor(start = null, end = null) {
    this.start = start
    this.end = end
  }
}`
  }
  return ''
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
export const useImperativeHandle = React.useImperativeHandle
export const forwardRef = React.forwardRef
export const createElement = React.createElement
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
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame, ${names.extend} as extend } from ${from}
export { useThree, useFrame, extend }
`
}

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function linesShim(): string {
  return `export { Line2 } from ${JSON.stringify(LINE2)}
export { LineMaterial } from ${JSON.stringify(LINE_MATERIAL)}
export { LineSegmentsGeometry } from ${JSON.stringify(LINE_SEGMENTS_GEOMETRY)}
`
}

function threeShim(indexFile: string, found: Record<string, string>, missing: readonly string[]): string {
  const from = fromIndex(indexFile)
  const spec = Object.entries(found)
    .map(([key, external]) => `${external} as ${key}`)
    .join(', ')
  const lines = [`import { ${spec} } from ${from}`, `export { ${Object.keys(found).join(', ')} }`]
  for (const name of missing) {
    const relative = SRC_FALLBACK[name]
    if (relative) {
      lines.push(`export { ${name} } from ${JSON.stringify(join(THREE_SRC, relative))}`)
      continue
    }
    const stub = inlineStub(name)
    if (!stub) throw new Error(`T072：three.${name} 没有从入口包导出，也没有替身`)
    lines.push(stub)
  }
  return `${lines.join('\n')}\n`
}

function shimPlugin(names: GridBindings, found: Record<string, string>, missing: readonly string[], externalSegments: boolean): EsbuildPlugin {
  return {
    name: 'segments-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'segments-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'segments-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'segments-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'segments-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: 'lines', namespace: 'segments-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'segments-shim' }))
      if (externalSegments) {
        build.onResolve({ filter: /^\.\/BatchSegments(?:\.tsx)?$/ }, () => ({
          path: './BatchSegments.js',
          external: true,
        }))
      }
      build.onLoad({ filter: /.*/, namespace: 'segments-shim' }, (args) => {
        const contents =
          args.path === 'react'
            ? reactShim(names.indexFile, names)
            : args.path === 'jsx'
              ? jsxShim(names.indexFile, names)
              : args.path === 'fiber'
                ? fiberShim(names.indexFile, names)
                : args.path === 'three'
                  ? threeShim(names.indexFile, found, missing)
                  : args.path === 'lines'
                    ? linesShim()
                    : storeShim(names.indexFile, names)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  externalSegments: boolean,
  names: GridBindings,
  found: Record<string, string>,
  missing: readonly string[],
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
    plugins: [shimPlugin(names, found, missing, externalSegments)],
  })
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T072：批线分包没有打成单个文件')
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

export function segmentsAfterHash(): Plugin {
  return {
    name: 'segments-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      if (!code.includes(SEGMENTS_SOURCE_BLOCK)) {
        this.error('T072：dock 里的批线接线变了，生产构建无法在哈希前摘干净')
      }
      return { code: code.replace(SEGMENTS_SOURCE_BLOCK, ''), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T072：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      if (index.code.includes('SegmentMount') || index.code.includes('BatchSegments') || index.code.includes('segments/mount')) {
        this.error('T072：批线被打进了入口包')
      }
      if (fx.code.includes('BatchSegments') || fx.code.includes('core/Segments') || fx.code.includes('segments/mount')) {
        this.error('T072：批线被打进了 balancedFx')
      }
      if (dock.code.includes('segments/mount') || dock.code.includes('BatchSegments')) {
        this.error('T072：哈希前的 dock 仍带着批线')
      }
      const names = discoverGridBindings(index.code, dock.code, loop.code)
      const looked = lookupThreeExports(index.code, ALL_THREE)
      const absent = REQUIRED_THREE.filter((key) => !looked.found[key])
      if (absent.length > 0) {
        this.error(`T072：入口包缺少 three 导出 ${absent.join(', ')}`)
        return
      }
      const scrub = (source: string) => source.replace(/\/\/[^\n]*https?:\/\/[^\n]*/g, '')
      const mount = scrub(await bundleEntry(MOUNT_ENTRY, true, names, looked.found, looked.missing))
      const segments = scrub(await bundleEntry(SEGMENTS_ENTRY, false, names, looked.found, looked.missing))
      if (mount.includes('Segment must used inside') || mount.includes('LineMaterial')) {
        this.error('T072：开关分包把 Segments 打进去了')
      }
      if (!mount.includes('./BatchSegments.js') || !mount.includes('mountBatchSegments')) {
        this.error('T072：开关分包没有延迟加载 Segments')
      }
      if (!segments.includes('Segment must used inside Segments component')) {
        this.error('T072：Segments 分包里没有 drei Segments')
      }
      if (!segments.includes('LineMaterial') || !segments.includes('setPositions')) {
        this.error('T072：Segments 分包里没有 LineMaterial')
      }
      if (!segments.includes(`./${names.indexFile}`) || !mount.includes(`./${names.indexFile}`)) {
        this.error('T072：批线分包没有复用入口包')
      }
      if (segments.includes('WebGLRenderer') || mount.includes('WebGLRenderer')) {
        this.error('T072：批线分包把 three 渲染器打进去了')
      }
      const linkAt = `${segments}\n${mount}`.indexOf('https://')
      if (segments.includes('jsdelivr') || mount.includes('jsdelivr') || linkAt >= 0) {
        const blob = `${segments}\n${mount}`
        this.error(`T072：批线分包带了外链 ${blob.slice(Math.max(0, linkAt - 40), linkAt + 80)}`)
      }
      if (segments.length > 500_000 || mount.length > 80_000) {
        this.error(`T072：批线分包过大 mount=${mount.length} segments=${segments.length}`)
      }
      bundle['assets/SegmentMount.js'] = asset('assets/SegmentMount.js', mount)
      bundle['assets/BatchSegments.js'] = asset('assets/BatchSegments.js', segments)
      dock.code += `\nvoid import("./SegmentMount.js").then((m)=>{m.mountBatchSegments()});\n`
    },
  }
}
