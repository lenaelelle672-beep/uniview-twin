import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的点云接线摘掉。
 * drei Points 和 PointMaterial 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、点云分包，以及这两个 drei 模块各自的分包接回。
 * T124：Sampler 跟在点云分包后面单独成包。MeshSurfaceSampler 只从 three-stdlib 的那一个文件打进来。
 * 这些模块都在 dock 之后、并且过了点云门闩才请求，不进 hardGate / balancedFx。
 */
export const SENSOR_POINTS_SOURCE_BLOCK = `// T119：传感器/告警点云。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../sensor-points/mount').then((mod) => {
  mod.mountSensorPoints()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/sensor-points/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/sensor-points/SensorCloud.tsx', import.meta.url))
const DREI_POINTS = fileURLToPath(new URL('../node_modules/@react-three/drei/core/Points.js', import.meta.url))
const DREI_POINT_MATERIAL = fileURLToPath(
  new URL('../node_modules/@react-three/drei/core/PointMaterial.js', import.meta.url),
)
const DREI_SAMPLER = fileURLToPath(new URL('../node_modules/@react-three/drei/core/Sampler.js', import.meta.url))
const MESH_SURFACE_SAMPLER = fileURLToPath(
  new URL('../node_modules/three-stdlib/math/MeshSurfaceSampler.js', import.meta.url),
)
const SURFACE_ENTRY = fileURLToPath(new URL('../src/sensor-points/SurfaceSample.tsx', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS =
  /sensor-points|mountSensorPoints|SensorCloud|__twinSensorPoints|sensorPoints|PointMaterialImpl|PointsBuffer|PositionPoint|useSurfaceSampler|MeshSurfaceSampler|SensorSampler|SensorSamplePlate/

const STUB_OK = new Set([
  'Matrix4',
  'Ray',
  'Sphere',
  'DynamicDrawUsage',
  'PointsMaterial',
  'Material',
  'InstancedBufferAttribute',
  'Object3D',
  'Triangle',
])

/**
 * MeshSurfaceSampler 只调用 getArea / getNormal。
 * 面积必须和 three.Triangle 一致，两片楼板三角形的权重才不会偏。
 * 单测用这份字符串对 three.Triangle。
 */
export const TRIANGLE_CLASS = `class Triangle {
  constructor(a, b, c) {
    this.a = a || new Vector3()
    this.b = b || new Vector3()
    this.c = c || new Vector3()
  }
  getArea() {
    const ax = this.c.x - this.b.x
    const ay = this.c.y - this.b.y
    const az = this.c.z - this.b.z
    const bx = this.a.x - this.b.x
    const by = this.a.y - this.b.y
    const bz = this.a.z - this.b.z
    const cx = ay * bz - az * by
    const cy = az * bx - ax * bz
    const cz = ax * by - ay * bx
    return Math.hypot(cx, cy, cz) * 0.5
  }
  getNormal(target) {
    const ax = this.c.x - this.b.x
    const ay = this.c.y - this.b.y
    const az = this.c.z - this.b.z
    const bx = this.a.x - this.b.x
    const by = this.a.y - this.b.y
    const bz = this.a.z - this.b.z
    const cx = ay * bz - az * by
    const cy = az * bx - ax * bz
    const cz = ax * by - ay * bx
    const length = Math.hypot(cx, cy, cz)
    if (length > 0) return target.set(cx / length, cy / length, cz / length)
    return target.set(0, 0, 0)
  }
}`

const OBJECT3D_CLASS = `class Object3D {
  constructor() {
    this.position = new Vector3()
    const elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    this.matrix = {
      elements,
      toArray(target, offset = 0) {
        target.set(elements, offset)
        return target
      },
    }
  }
  updateMatrix() {
    const elements = this.matrix.elements
    elements[12] = this.position.x
    elements[13] = this.position.y
    elements[14] = this.position.z
  }
  updateMatrixWorld() {
    this.updateMatrix()
  }
}`

const INSTANCED_ATTRIBUTE_CLASS = `class InstancedBufferAttribute {
  constructor(array, itemSize) {
    this.array = array
    this.itemSize = itemSize
    this.count = array.length / itemSize
    this.needsUpdate = false
  }
  copy(source) {
    this.array = source.array
    this.itemSize = source.itemSize
    this.count = source.count ?? source.array.length / source.itemSize
    this.needsUpdate = true
    return this
  }
}`

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

function addNamedThreeImports(source: string, names: Set<string>): void {
  for (const match of source.matchAll(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"]three['"]/g)) {
    if (match[1]) continue
    for (const part of (match[2] ?? '').split(',')) {
      const piece = part.trim()
      if (!piece || piece.startsWith('type ')) continue
      const name = piece.split(/\s+as\s+/)[0]?.trim()
      if (name) names.add(name)
    }
  }
}

function addNamespaceThreeImports(source: string, names: Set<string>): void {
  for (const match of source.matchAll(/\bTHREE\.([A-Za-z_$][\w$]*)/g)) {
    if (match[1]) names.add(match[1])
  }
}

/**
 * drei Points / PointMaterial 走 `THREE.`。
 * Sampler 和 MeshSurfaceSampler 走具名导入。警告字符串里的 `THREE.MeshSurfaceSampler` 不是导出。
 */
export function threeImportNames(): string[] {
  const names = new Set<string>(['Color', 'Group', 'Vector3', 'MeshBasicMaterial', 'REVISION'])
  for (const file of [LIVE_ENTRY, SURFACE_ENTRY, DREI_POINTS, DREI_POINT_MATERIAL, DREI_SAMPLER, MESH_SURFACE_SAMPLER]) {
    addNamedThreeImports(readFileSync(file, 'utf8'), names)
  }
  for (const file of [DREI_POINTS, DREI_POINT_MATERIAL]) {
    addNamespaceThreeImports(readFileSync(file, 'utf8'), names)
  }
  return [...names].sort()
}

function pointsMaterialClass(hasMaterial: boolean): string {
  const base = hasMaterial ? 'Material' : 'Object.getPrototypeOf(MeshBasicMaterial)'
  return `const PointsMaterialBase = ${base}
export class PointsMaterial extends PointsMaterialBase {
  constructor(parameters) {
    super()
    this.isPointsMaterial = true
    this.type = 'PointsMaterial'
    this.color = new Color(0xffffff)
    this.map = null
    this.alphaMap = null
    this.size = 1
    this.sizeAttenuation = true
    this.fog = true
    this.setValues(parameters)
  }
  copy(source) {
    super.copy(source)
    this.color.copy(source.color)
    this.map = source.map
    this.alphaMap = source.alphaMap
    this.size = source.size
    this.sizeAttenuation = source.sizeAttenuation
    this.fog = source.fog
    return this
  }
}
`
}

function threeShim(indexFile: string, found: Record<string, string>, missing: string[]): string {
  if (!found.Color) throw new Error('T119：入口包没有 three.Color')
  if (!found.Group) throw new Error('T119：入口包没有 three.Group')
  if (!found.Vector3) throw new Error('T119：入口包没有 three.Vector3')
  if (!found.MeshBasicMaterial) throw new Error('T119：入口包没有 three.MeshBasicMaterial')
  if (!found.REVISION) throw new Error('T119：入口包没有 three.REVISION')
  const unknown = missing.filter((name) => !STUB_OK.has(name))
  if (unknown.length > 0) throw new Error(`T119：three 缺导出 ${unknown.join(', ')}`)
  const keys = Object.keys(found)
  const spec = keys.map((key) => `${found[key]} as ${key}`).join(', ')
  const lines = [
    `import { ${spec} } from ${JSON.stringify(`./${indexFile}`)}`,
    `export { ${keys.join(', ')} }`,
  ]
  if (!found.Matrix4) {
    lines.push(`export class Matrix4 {
  copy() { return this }
  invert() { return this }
}`)
  }
  if (!found.Ray) {
    lines.push(`export class Ray {
  copy() { return this }
  applyMatrix4() { return this }
  distanceSqToPoint() { return Infinity }
  closestPointToPoint(_point, target) { return target }
}`)
  }
  if (!found.Sphere) {
    lines.push(`export class Sphere {
  set() { return this }
}`)
  }
  if (!found.DynamicDrawUsage) lines.push('export const DynamicDrawUsage = 35048')
  if (!found.PointsMaterial) lines.push(pointsMaterialClass(Boolean(found.Material)))
  if (!found.InstancedBufferAttribute) lines.push(`export ${INSTANCED_ATTRIBUTE_CLASS}`)
  if (!found.Object3D) lines.push(`export ${OBJECT3D_CLASS}`)
  if (!found.Triangle) lines.push(`export ${TRIANGLE_CLASS}`)
  return lines.join('\n')
}

function reactShim(indexFile: string, react: string): string {
  const from = JSON.stringify(`./${indexFile}`)
  return `import { ${react} as React } from ${from}
export default React
export const useState = React.useState
export const useEffect = React.useEffect
export const useLayoutEffect = React.useLayoutEffect
export const useMemo = React.useMemo
export const useCallback = React.useCallback
export const useRef = React.useRef
export const useContext = React.useContext
export const useImperativeHandle = React.useImperativeHandle
export const forwardRef = React.forwardRef
export const createElement = React.createElement
export const createContext = React.createContext
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
  return `import { ${names.useThree} as useThree, ${names.useFrame} as useFrame, ${names.extend} as extend } from ${from}
export { useThree, useFrame, extend }
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
  kind: 'mount' | 'live' | 'module' | 'sampler',
): EsbuildPlugin {
  return {
    name: 'sensor-points-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/SensorCloud(?:\.tsx)?$/ }, () => ({
          path: './SensorCloud.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /(?:^|\/)Points(?:\.js)?$/ }, () => ({
          path: './SensorPoints.js',
          external: true,
        }))
        build.onResolve({ filter: /(?:^|\/)PointMaterial(?:\.js)?$/ }, () => ({
          path: './SensorPointMaterial.js',
          external: true,
        }))
        build.onResolve({ filter: /(?:^|\/)Sampler(?:\.js)?$/ }, (args) => {
          if (args.path.includes('MeshSurfaceSampler')) return null
          return { path: './SensorSampler.js', external: true }
        })
      }
      if (kind === 'sampler') {
        build.onResolve({ filter: /^three-stdlib$/ }, () => ({
          path: MESH_SURFACE_SAMPLER,
        }))
      }
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'points-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'points-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'points-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'points-shim' }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'points-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'points-shim' }, (args) => {
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
  kind: 'mount' | 'live' | 'module' | 'sampler',
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
    plugins: [shimPlugin(names, three, kind)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T119：点云分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T119：点云分包没有打成单个文件')
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
  if (result.status !== 0) throw new Error(`T119：${label} 语法检查失败 ${result.stderr}`)
}

export function stripSensorPointsSource(code: string): string {
  if (!code.includes(SENSOR_POINTS_SOURCE_BLOCK)) {
    throw new Error('T119：dock 里的点云接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(SENSOR_POINTS_SOURCE_BLOCK, '')
  if (next.includes('mountSensorPoints') || next.includes('sensor-points')) {
    throw new Error('T119：摘完 dock 仍留着点云接线')
  }
  return next
}

export function sensorPointsAfterHash(): Plugin {
  return {
    name: 'sensor-points-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripSensorPointsSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T119：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          const at = hit.index ?? 0
          this.error(`T119：点云被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」${chunk.code.slice(Math.max(0, at - 80), at + 80)}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T119：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, threeImportNames())
      let mount = ''
      let live = ''
      let points = ''
      let material = ''
      let sampler = ''
      try {
        mount = await bundleEntry(MOUNT_ENTRY, 'mount', names, looked)
        live = await bundleEntry(LIVE_ENTRY, 'live', names, looked)
        points = await bundleEntry(DREI_POINTS, 'module', names, looked)
        material = await bundleEntry(DREI_POINT_MATERIAL, 'module', names, looked)
        sampler = await bundleEntry(DREI_SAMPLER, 'sampler', names, looked)
        assertSyntax(mount, 'SensorPointsMount')
        assertSyntax(live, 'SensorCloud')
        assertSyntax(points, 'SensorPoints')
        assertSyntax(material, 'SensorPointMaterial')
        assertSyntax(sampler, 'SensorSampler')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T119：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./SensorCloud.js') || !mount.includes('mountSensorPoints')) {
        this.error('T119：开关分包没有延迟加载点云')
      }
      if (mount.includes('gl_PointCoord') || mount.includes('distanceSqToPoint')) {
        this.error('T119：开关分包把 Points 或 PointMaterial 打进去了')
      }
      if (!live.includes('./SensorPoints.js') || !live.includes('./SensorPointMaterial.js')) {
        this.error('T119：点云分包没有分开引用 Points 和 PointMaterial')
      }
      if (!live.includes('./SensorSampler.js')) {
        this.error('T124：点云分包没有分开引用 Sampler')
      }
      if (live.includes('gl_PointCoord') || live.includes('distanceSqToPoint') || live.includes('THREE.MeshSurfaceSampler')) {
        this.error('T119：点云分包把 drei 模块内联了')
      }
      if (mount.includes('./SensorSampler.js') || mount.includes('MeshSurfaceSampler') || mount.includes('captureSurfaceSample')) {
        this.error('T124：开关分包把采样打进去了')
      }
      if (!points.includes('distanceSqToPoint') || points.includes('gl_PointCoord')) {
        this.error('T119：Points 模块分包不对')
      }
      if (!material.includes('gl_PointCoord') || material.includes('distanceSqToPoint')) {
        this.error('T119：PointMaterial 模块分包不对')
      }
      if (!sampler.includes('THREE.MeshSurfaceSampler')) {
        this.error('T124：Sampler 分包没有带上 MeshSurfaceSampler')
      }
      if (/GLTFLoader|RGBELoader|three-stdlib/.test(sampler)) {
        this.error('T124：Sampler 分包把 three-stdlib 整包打进去了')
      }
      const bundled = mount + live + points + material + sampler
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T119：点云分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei/.test(bundled)) {
        this.error('T119：点云分包把 three 整包或 drei 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b/.test(bundled)) {
        this.error('T119：点云分包带了外链或 HDR')
      }
      if (
        mount.length > 16_000 ||
        live.length > 16_000 ||
        points.length > 24_000 ||
        material.length > 24_000 ||
        sampler.length > 48_000
      ) {
        this.error(
          `T119：点云分包过大 mount=${mount.length} live=${live.length} points=${points.length} material=${material.length} sampler=${sampler.length}`,
        )
      }
      bundle['assets/SensorPointsMount.js'] = asset('assets/SensorPointsMount.js', mount)
      bundle['assets/SensorCloud.js'] = asset('assets/SensorCloud.js', live)
      bundle['assets/SensorPoints.js'] = asset('assets/SensorPoints.js', points)
      bundle['assets/SensorPointMaterial.js'] = asset('assets/SensorPointMaterial.js', material)
      bundle['assets/SensorSampler.js'] = asset('assets/SensorSampler.js', sampler)
      dock.code += `\nvoid import("./SensorPointsMount.js").then((m)=>{m.mountSensorPoints()});\n`
    },
  }
}
