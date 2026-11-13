import { build as esbuild, type Plugin as EsbuildPlugin } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { discoverGridBindings, type GridBindings } from '../src/grid/bindings'
import { lookupThreeExports } from './segmentsPlugin'

/**
 * 哈希定稿前把 dock 里的关系弧接线摘掉。
 * drei CubicBezierLine / QuadraticBezierLine 不进 vite 图，所以不会带动 index / balancedFx / dock 的哈希。
 * 定稿后再把开关分包、弧分包，以及 CubicBezierLine、QuadraticBezierLine、Line 各自的分包接回。
 * CubicBezierLine 只经 Line.js 画线，曲线类不进 hardGate。
 */
export const RELATION_ARC_SOURCE_BLOCK = `
// T125：设备与告警的静态贝塞尔关系弧。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../relation-arcs/mount').then((mod) => {
  mod.mountRelationArcs()
})
`

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOUNT_ENTRY = fileURLToPath(new URL('../src/relation-arcs/mount.ts', import.meta.url))
const LIVE_ENTRY = fileURLToPath(new URL('../src/relation-arcs/RelationArcs.tsx', import.meta.url))
const DREI_CUBIC = fileURLToPath(new URL('../node_modules/@react-three/drei/core/CubicBezierLine.js', import.meta.url))
const DREI_QUADRATIC = fileURLToPath(new URL('../node_modules/@react-three/drei/core/QuadraticBezierLine.js', import.meta.url))
const DREI_LINE = fileURLToPath(new URL('../node_modules/@react-three/drei/core/Line.js', import.meta.url))
const CUBIC_CURVE = fileURLToPath(new URL('../node_modules/three/src/extras/curves/CubicBezierCurve3.js', import.meta.url))
const QUAD_CURVE = fileURLToPath(new URL('../node_modules/three/src/extras/curves/QuadraticBezierCurve3.js', import.meta.url))
const LINES = fileURLToPath(new URL('../node_modules/three-stdlib/lines', import.meta.url))

/** 入口包和 balancedFx、DemandLoop、哈希前的 dock 里都不许出现这些。 */
const GATE_MARKERS =
  /relation-arcs|mountRelationArcs|RelationArcs|__twinRelationArc|DeviceAlarmRelations|CubicBezierLine|QuadraticBezierLine|RelationQuadratic|RelationCubic/

const LINE_THREE = [
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

const CURVE_THREE = ['Vector2', 'Vector3', 'Matrix4', 'MathUtils'] as const

type Kind = 'mount' | 'live' | 'cubic' | 'quadratic' | 'line' | 'curves'

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

function fromIndex(indexFile: string): string {
  return JSON.stringify(`./${indexFile}`)
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
export default React
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

function storeShim(indexFile: string, names: GridBindings): string {
  const from = fromIndex(indexFile)
  return `import { ${names.store} as useTwinStore } from ${from}
export { useTwinStore }
`
}

function extendsShim(): string {
  return `export default function _extends(){return Object.assign.apply(Object, arguments)}\n`
}

function namedFromIndex(indexFile: string, found: Record<string, string>, names: readonly string[]): string {
  const missing = names.filter((name) => !found[name])
  if (missing.length > 0) throw new Error(`T125：入口包没有导出 ${missing.join(', ')}`)
  const spec = names.map((name) => `${found[name]} as ${name}`).join(', ')
  return `import { ${spec} } from ${fromIndex(indexFile)}
export { ${names.join(', ')} }
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

function mathShim(indexFile: string, found: Record<string, string>, which: 'vec3' | 'vec2' | 'mat4' | 'math' | 'warn'): string {
  if (which === 'warn') return `export function warn() {}\n`
  if (which === 'math') {
    const name = found.MathUtils
    if (!name) throw new Error('T125：入口包没有导出 MathUtils')
    return `import { ${name} as MathUtils } from ${fromIndex(indexFile)}
export const clamp = MathUtils.clamp
export { MathUtils }
`
  }
  const key = which === 'vec3' ? 'Vector3' : which === 'vec2' ? 'Vector2' : 'Matrix4'
  const external = found[key]
  if (!external) throw new Error(`T125：入口包没有导出 ${key}`)
  return `export { ${external} as ${key} } from ${fromIndex(indexFile)}\n`
}

function shimPlugin(names: GridBindings, found: Record<string, string>, kind: Kind, curvesExternal: boolean): EsbuildPlugin {
  return {
    name: 'relation-arc-shims',
    setup(build) {
      build.onResolve({ filter: /^\.\/index-[^/]+\.js$/ }, (args) => ({
        path: args.path,
        external: true,
      }))
      build.onResolve({ filter: /^\.\/BezierCurve3\.js$/ }, () => ({
        path: './BezierCurve3.js',
        external: true,
      }))
      if (kind === 'mount') {
        build.onResolve({ filter: /^\.\/RelationArcs(?:\.tsx)?$/ }, () => ({
          path: './RelationArcs.js',
          external: true,
        }))
      }
      if (kind === 'live') {
        build.onResolve({ filter: /CubicBezierLine(?:\.js)?$/ }, () => ({
          path: './CubicBezierLine.js',
          external: true,
        }))
        build.onResolve({ filter: /QuadraticBezierLine(?:\.js)?$/ }, () => ({
          path: './QuadraticBezierLine.js',
          external: true,
        }))
      }
      if (kind === 'cubic' || kind === 'quadratic') {
        build.onResolve({ filter: /^\.\/Line(?:\.js)?$/ }, () => ({
          path: './Line.js',
          external: true,
        }))
      }
      const fromThreeSrc = (args: { path: string; resolveDir: string; importer: string }) =>
        args.resolveDir.includes('/three/src/') || args.importer.includes('/three/src/')
      build.onResolve({ filter: /(?:^|\/)Vector3\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'vec3', namespace: 'rel-math' } : undefined,
      )
      build.onResolve({ filter: /(?:^|\/)Vector2\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'vec2', namespace: 'rel-math' } : undefined,
      )
      build.onResolve({ filter: /(?:^|\/)Matrix4\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'mat4', namespace: 'rel-math' } : undefined,
      )
      build.onResolve({ filter: /(?:^|\/)MathUtils\.js$/ }, (args) =>
        fromThreeSrc(args) ? { path: 'math', namespace: 'rel-math' } : undefined,
      )
      build.onResolve({ filter: /(?:^|\/)utils\.js$/ }, (args) => {
        const base = args.path.split('/').pop()
        return base === 'utils.js' && fromThreeSrc(args) ? { path: 'warn', namespace: 'rel-math' } : undefined
      })
      build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'rel-shim' }))
      build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'rel-shim' }))
      build.onResolve({ filter: /^@react-three\/fiber$/ }, () => ({ path: 'fiber', namespace: 'rel-shim' }))
      build.onResolve({ filter: /^three$/ }, () => ({ path: 'three', namespace: 'rel-shim' }))
      build.onResolve({ filter: /^three-stdlib$/ }, () => ({ path: 'lines', namespace: 'rel-shim' }))
      build.onResolve({ filter: /^@babel\/runtime\/helpers\/esm\/extends$/ }, () => ({
        path: 'extends',
        namespace: 'rel-shim',
      }))
      build.onResolve({ filter: /^\.\.\/store\/store$/ }, () => ({ path: 'store', namespace: 'rel-shim' }))
      build.onLoad({ filter: /.*/, namespace: 'rel-math' }, (args) => {
        const which = args.path as 'vec3' | 'vec2' | 'mat4' | 'math' | 'warn'
        return { contents: mathShim(names.indexFile, found, which), loader: 'js', resolveDir: ROOT }
      })
      build.onLoad({ filter: /.*/, namespace: 'rel-shim' }, (args) => {
        let contents = ''
        if (args.path === 'react') contents = reactShim(names.indexFile, names)
        else if (args.path === 'jsx') contents = jsxShim(names.indexFile, names)
        else if (args.path === 'fiber') contents = fiberShim(names.indexFile, names)
        else if (args.path === 'store') contents = storeShim(names.indexFile, names)
        else if (args.path === 'extends') contents = extendsShim()
        else if (args.path === 'lines') contents = linesShim()
        else if (args.path === 'three') {
          if (kind === 'line') contents = namedFromIndex(names.indexFile, found, LINE_THREE)
          else if (kind === 'curves') contents = namedFromIndex(names.indexFile, found, CURVE_THREE)
          else if (curvesExternal) {
            const curve = kind === 'quadratic' ? 'QuadraticBezierCurve3' : 'CubicBezierCurve3'
            contents = `export { Vector3, ${curve} } from './BezierCurve3.js'\n`
          } else {
            const curve = kind === 'quadratic' ? 'QuadraticBezierCurve3' : 'CubicBezierCurve3'
            contents = namedFromIndex(names.indexFile, found, ['Vector3', curve])
          }
        }
        if (!contents) throw new Error(`T125：没有垫片 ${args.path}`)
        return { contents, loader: 'js', resolveDir: ROOT }
      })
    },
  }
}

async function bundleEntry(
  entry: string,
  kind: Kind,
  names: GridBindings,
  found: Record<string, string>,
  curvesExternal: boolean,
  stdin?: string,
): Promise<string> {
  const built = await esbuild({
    absWorkingDir: ROOT,
    entryPoints: stdin ? undefined : [entry],
    stdin: stdin
      ? { contents: stdin, resolveDir: ROOT, sourcefile: 'bezier-curves.js', loader: 'js' }
      : undefined,
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
    plugins: [shimPlugin(names, found, kind, curvesExternal)],
  })
  if (built.warnings.length > 0) {
    throw new Error(`T125：关系弧分包有警告 ${built.warnings.map((item) => item.text).join('; ')}`)
  }
  const file = built.outputFiles[0]
  if (!file || built.outputFiles.length !== 1) throw new Error('T125：关系弧分包没有打成单个文件')
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

function scrub(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/https?:\/\/\S+/g, ''))
    .replace(/(?<!https?:)\/\/[^\n]*https?:\/\/[^\n]*/g, '')
}

function assertSyntax(source: string, label: string): void {
  const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`T125：${label} 语法检查失败 ${result.stderr}`)
}

export function stripRelationArcSource(code: string): string {
  if (!code.includes(RELATION_ARC_SOURCE_BLOCK)) {
    throw new Error('T125：dock 里的关系弧接线变了，生产构建无法在哈希前摘干净')
  }
  const next = code.replace(RELATION_ARC_SOURCE_BLOCK, '')
  if (next.includes('mountRelationArcs') || next.includes('relation-arcs')) {
    throw new Error('T125：摘完 dock 仍留着关系弧接线')
  }
  return next
}

export function relationArcAfterHash(): Plugin {
  return {
    name: 'relation-arc-after-hash',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0]?.replaceAll('\\', '/')
      if (!file?.endsWith('/src/viewmarks/dock.tsx')) return null
      return { code: stripRelationArcSource(code), map: null }
    },
    async generateBundle(_options, bundle) {
      const chunks = chunksOf(bundle)
      const index = chunks.find((item) => item.fileName.startsWith('assets/index-') && item.fileName.endsWith('.js'))
      const dock = chunks.find((item) => item.name === 'dock')
      const loop = chunks.find((item) => item.name === 'DemandLoop')
      const fx = chunks.find((item) => item.name === 'balancedFx')
      if (!index || !dock || !loop || !fx) {
        this.error('T125：找不到入口包、dock、DemandLoop 或 balancedFx')
        return
      }
      for (const chunk of chunks) {
        const hit = chunk.code.match(GATE_MARKERS)
        if (hit) {
          const at = hit.index ?? 0
          this.error(`T125：关系弧被打进了 vite 分包 ${chunk.fileName}「${hit[0]}」${chunk.code.slice(Math.max(0, at - 80), at + 80)}`)
          return
        }
      }
      let names: GridBindings
      try {
        names = discoverGridBindings(index.code, dock.code, loop.code)
      } catch (error) {
        this.error(`T125：复用入口包失败 ${error instanceof Error ? error.message : error}`)
        return
      }
      const looked = lookupThreeExports(index.code, [...LINE_THREE, 'CubicBezierCurve3', 'QuadraticBezierCurve3'])
      const curvesExternal = !looked.found.CubicBezierCurve3 || !looked.found.QuadraticBezierCurve3
      let mount = ''
      let live = ''
      let cubic = ''
      let quadratic = ''
      let line = ''
      let curves = ''
      try {
        mount = scrub(await bundleEntry(MOUNT_ENTRY, 'mount', names, looked.found, curvesExternal))
        live = scrub(await bundleEntry(LIVE_ENTRY, 'live', names, looked.found, curvesExternal))
        cubic = scrub(await bundleEntry(DREI_CUBIC, 'cubic', names, looked.found, curvesExternal))
        quadratic = scrub(await bundleEntry(DREI_QUADRATIC, 'quadratic', names, looked.found, curvesExternal))
        line = scrub(await bundleEntry(DREI_LINE, 'line', names, looked.found, curvesExternal))
        if (curvesExternal) {
          const stdin = `export { CubicBezierCurve3 } from ${JSON.stringify(CUBIC_CURVE)}
export { QuadraticBezierCurve3 } from ${JSON.stringify(QUAD_CURVE)}
export { ${looked.found.Vector3} as Vector3 } from ${fromIndex(names.indexFile)}
`
          curves = scrub(await bundleEntry('', 'curves', names, looked.found, true, stdin))
        }
        assertSyntax(mount, 'RelationArcMount')
        assertSyntax(live, 'RelationArcs')
        assertSyntax(cubic, 'CubicBezierLine')
        assertSyntax(quadratic, 'QuadraticBezierLine')
        assertSyntax(line, 'Line')
        if (curves) assertSyntax(curves, 'BezierCurve3')
      } catch (error) {
        this.error(error instanceof Error ? error.message : `T125：分包失败 ${error}`)
        return
      }
      if (!mount.includes('./RelationArcs.js') || !mount.includes('mountRelationArcs')) {
        this.error('T125：开关分包没有延迟加载关系弧')
      }
      if (/isCubicBezierCurve3|isQuadraticBezierCurve3|LineMaterial|useFrame\(|CatmullRomLine|from"three"|drei\/core/.test(mount)) {
        this.error('T125：开关分包把曲线或 drei 打进去了')
      }
      if (!live.includes('./CubicBezierLine.js') || !live.includes('./QuadraticBezierLine.js') || !live.includes('DeviceAlarmRelations')) {
        this.error('T125：弧分包没有分开引用两条贝塞尔')
      }
      if (/LineMaterial|isLineMaterial|CubicBezierCurve3|useFrame\(|CatmullRomLine|setPositions/.test(live)) {
        this.error('T125：弧分包把 Line 或曲线类内联了')
      }
      if (!cubic.includes('./Line.js') || cubic.includes('LineMaterial') || cubic.includes('isLineMaterial') || cubic.includes('isCubicBezierCurve3')) {
        this.error('T125：CubicBezierLine 没有经由 Line.js')
      }
      if (!quadratic.includes('./Line.js') || quadratic.includes('LineMaterial') || quadratic.includes('isLineMaterial')) {
        this.error('T125：QuadraticBezierLine 没有经由 Line.js')
      }
      if (curvesExternal) {
        if (!cubic.includes('./BezierCurve3.js') || !quadratic.includes('./BezierCurve3.js')) {
          this.error('T125：贝塞尔组件没有把曲线类留在外面')
        }
        if (!curves.includes('isCubicBezierCurve3') || !curves.includes('isQuadraticBezierCurve3')) {
          this.error('T125：曲线分包不对')
        }
      }
      if (!line.includes('LineMaterial') && !line.includes('isLineMaterial')) {
        this.error('T125：Line 分包里没有线材质')
      }
      const dreiBlob = line + cubic + quadratic + curves
      if (/CatmullRomLine|TourPath|WalkPaths|BatchSegments|transmission|hls\.js/.test(dreiBlob)) {
        this.error('T125：关系弧分包混进了别的线')
      }
      const bundled = mount + live + cubic + quadratic + line + curves
      if (!bundled.includes(`./${names.indexFile}`)) {
        this.error('T125：关系弧分包没有复用入口包')
      }
      if (/from["']three["']|three\/examples|class WebGLRenderer|@react-three\/drei["']|from["']three-stdlib["']|from["']@babel/.test(bundled)) {
        this.error('T125：关系弧分包把 three 整包、drei 入口或 three-stdlib 入口打进去了')
      }
      if (/https?:|\/\/cdn|githack|jsdelivr|unpkg|\.hdr\b|meshline/.test(bundled)) {
        this.error('T125：关系弧分包带了外链、HDR 或 meshline')
      }
      if (mount.length > 16_000 || live.length > 20_000 || cubic.length > 8_000 || quadratic.length > 8_000 || line.length > 180_000) {
        this.error(
          `T125：关系弧分包过大 mount=${mount.length} live=${live.length} cubic=${cubic.length} quadratic=${quadratic.length} line=${line.length}`,
        )
      }
      if (curves && curves.length > 40_000) this.error(`T125：曲线分包过大 ${curves.length}`)
      bundle['assets/RelationArcMount.js'] = asset('assets/RelationArcMount.js', mount)
      bundle['assets/RelationArcs.js'] = asset('assets/RelationArcs.js', live)
      bundle['assets/CubicBezierLine.js'] = asset('assets/CubicBezierLine.js', cubic)
      bundle['assets/QuadraticBezierLine.js'] = asset('assets/QuadraticBezierLine.js', quadratic)
      bundle['assets/Line.js'] = asset('assets/Line.js', line)
      if (curves) bundle['assets/BezierCurve3.js'] = asset('assets/BezierCurve3.js', curves)
      dock.code += `\nvoid import("./RelationArcMount.js").then((m)=>{m.mountRelationArcs()});\n`
    },
  }
}
