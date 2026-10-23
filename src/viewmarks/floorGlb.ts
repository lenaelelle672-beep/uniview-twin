/**
 * T057：把当前层可见子集导出成 GLB。
 * GLTFExporter 只在点击后动态拉取，不进首屏 hardGate / cutoff。
 * 只交这一层的室内和外壳，不把整塔、场地和全场实例一次送进去。
 * 实例、合批、自定义着色写不全时降级提示，不把异常抛到界面上。
 *
 * 这里不静态 import three 的类：首屏包已经包含它们，再从懒包点名会多出导出，
 * 硬门禁只剩几十个字节。复制节点用对象自己的 clone。
 */
import type { InstancedMesh, Material, Mesh, Object3D } from 'three'
import { useTwinStore } from '../store/store'
import type { ViewMode } from '../types'

export const FLOOR_GLB_NEED_FLOOR = '先进入一层再导出'
export const FLOOR_GLB_EARLY = '场景还没准备好'
export const FLOOR_GLB_EMPTY = '当前层没有可导出的可见模型'
export const FLOOR_GLB_FAILED = '导出没有完成'

export type ExportGap = 'instanced' | 'batched' | 'shader'

const GAP_ORDER: ExportGap[] = ['instanced', 'batched', 'shader']

const GAP_LABEL: Record<ExportGap, string> = {
  instanced: '实例',
  batched: '合批',
  shader: '自定义着色',
}

const FLOOR_ID = /^(?:B1|F(?:[1-9]|1[0-9]|2[0-2]))$/

export interface FloorGlbResult {
  ok: boolean
  partial: boolean
  message: string
}

export interface GlbExporter {
  parseAsync(input: Object3D | Object3D[], options: { binary: true; onlyVisible: true }): Promise<unknown>
}

export interface FloorGlbPorts {
  view: ViewMode
  floorId: string | null
  scene: Object3D | null
  loadExporter: () => Promise<GlbExporter>
  download: (bytes: ArrayBuffer, filename: string) => void
}

type Kind = Object3D & {
  isMesh?: boolean
  isLine?: boolean
  isPoints?: boolean
  isInstancedMesh?: boolean
  isSkinnedMesh?: boolean
  isBatchedMesh?: boolean
  isBatchedText?: boolean
  sync?: unknown
}

export function floorGlbFilename(floorId: string): string {
  return `${floorId}.glb`
}

export function floorGlbSaved(filename: string, gaps: readonly ExportGap[]): string {
  if (gaps.length === 0) return `已下载 ${filename}。部分模型没有完整写入`
  return `已下载 ${filename}。${gaps.map((gap) => GAP_LABEL[gap]).join('、')}没有完整写入`
}

function currentFloorId(view: ViewMode, floorId: string | null): string | null {
  if (view !== 'floor' || !floorId || !FLOOR_ID.test(floorId)) return null
  return floorId
}

function isShown(object: Object3D): boolean {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function findShownByName(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null
  root.traverse((object) => {
    if (found || object.name !== name || !isShown(object)) return
    found = object
  })
  return found
}

/** 当前层室内 + 这一层的外壳。看不见的根（含被父级藏起来的）不送进导出器。 */
export function floorExportRoots(scene: Object3D, floorId: string): Object3D[] {
  const roots: Object3D[] = []
  const interior = findShownByName(scene, 'FloorInterior')
  if (interior) roots.push(interior)
  const shellName = floorId === 'B1' ? 'B1' : `FloorShell-${floorId}`
  const shell = findShownByName(scene, shellName)
  if (shell && shell !== interior) roots.push(shell)
  return roots
}

function asKind(object: Object3D): Kind {
  return object as Kind
}

function materialsOf(object: Object3D): Material[] {
  const kind = asKind(object)
  if (!kind.isMesh && !kind.isLine && !kind.isPoints) return []
  const material = (object as Mesh).material
  if (!material) return []
  return Array.isArray(material) ? material : [material]
}

function isCustomShaderMaterial(material: Material): boolean {
  if ((material as { isShaderMaterial?: boolean }).isShaderMaterial) return true
  return Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile')
}

function isBatchedObject(object: Object3D): boolean {
  const batched = asKind(object)
  if (batched.isBatchedMesh || batched.isBatchedText) return true
  if (object.name.includes('BatchedText')) return true
  return Boolean(batched.isMesh && typeof batched.sync === 'function' && 'text' in batched)
}

function instancedGap(object: Object3D): boolean {
  const mesh = object as InstancedMesh
  if (!asKind(object).isInstancedMesh) return false
  if (!mesh.instanceMatrix) return true
  if (mesh.instanceColor) return true
  const attributes = mesh.geometry?.attributes
  if (!attributes) return false
  for (const attribute of Object.values(attributes)) {
    if ((attribute as { isInstancedBufferAttribute?: boolean }).isInstancedBufferAttribute) return true
  }
  return false
}

function gapsOf(object: Object3D): ExportGap[] {
  const gaps: ExportGap[] = []
  if (instancedGap(object)) gaps.push('instanced')
  if (isBatchedObject(object)) gaps.push('batched')
  if (materialsOf(object).some(isCustomShaderMaterial)) gaps.push('shader')
  return gaps
}

/** 与 onlyVisible 一样，不走进已经隐藏的子树。 */
export function visibleExportGaps(roots: readonly Object3D[]): ExportGap[] {
  const found = new Set<ExportGap>()
  const visit = (object: Object3D) => {
    if (!object.visible) return
    for (const gap of gapsOf(object)) found.add(gap)
    for (const child of object.children) visit(child)
  }
  for (const root of roots) visit(root)
  return GAP_ORDER.filter((gap) => found.has(gap))
}

function copyTransform(source: Object3D, target: Object3D) {
  target.position.copy(source.position)
  target.quaternion.copy(source.quaternion)
  target.scale.copy(source.scale)
  if (!source.matrixAutoUpdate) {
    target.matrix.copy(source.matrix)
    target.matrixAutoUpdate = false
  }
}

function isDrawable(object: Object3D): boolean {
  const kind = asKind(object)
  return Boolean(kind.isMesh || kind.isLine || kind.isPoints)
}

/** InstancedMesh 的无参构造会炸，不能走 clone。其余用对象自己的构造器。 */
function cloneShallow(source: Object3D): Object3D | null {
  if (asKind(source).isInstancedMesh) return null
  try {
    return source.clone(false)
  } catch {
    return null
  }
}

function emptyGroup(sample: Object3D): Object3D | null {
  let seed: Object3D | null = sample.parent
  while (seed && isDrawable(seed)) seed = seed.parent
  const basis = seed ?? sample
  if (asKind(basis).isInstancedMesh) return null
  try {
    const group = basis.clone(false)
    while (group.children.length > 0) {
      const child = group.children[0]
      if (!child) break
      group.remove(child)
    }
    group.name = sample.name
    group.visible = true
    copyTransform(sample, group)
    return group
  } catch {
    return null
  }
}

function withChildren(node: Object3D | null, children: Object3D[]): Object3D | null {
  if (!node) return null
  for (const child of children) node.add(child)
  return node
}

function cloneWithoutGaps(source: Object3D): Object3D | null {
  if (!source.visible) return null
  const children: Object3D[] = []
  for (const child of source.children) {
    const next = cloneWithoutGaps(child)
    if (next) children.push(next)
  }
  const skip = gapsOf(source).length > 0 || Boolean(asKind(source).isInstancedMesh)
  if (skip) {
    if (children.length === 0) return null
    return withChildren(emptyGroup(source), children)
  }
  if (!isDrawable(source) && children.length === 0) return null
  const copy = cloneShallow(source)
  if (!copy) {
    if (children.length === 0) return null
    return withChildren(emptyGroup(source), children)
  }
  return withChildren(copy, children)
}

function isPlainExportMesh(object: Object3D): boolean {
  const mesh = object as Mesh
  const kind = asKind(object)
  if (!kind.isMesh) return false
  if (kind.isInstancedMesh || kind.isSkinnedMesh) return false
  if (gapsOf(object).length > 0) return false
  const materials = materialsOf(object)
  if (materials.length === 0) return false
  for (const material of materials) {
    const standard = material as Material & { isMeshStandardMaterial?: boolean; isMeshBasicMaterial?: boolean }
    if (!standard.isMeshStandardMaterial && !standard.isMeshBasicMaterial) return false
    if (isCustomShaderMaterial(material)) return false
    const colored = material as Material & { color?: { toArray?: () => unknown } }
    if (typeof colored.color?.toArray !== 'function') return false
  }
  const position = mesh.geometry?.getAttribute?.('position') as { array?: unknown } | undefined
  if (!position?.array || (position.array as { constructor?: unknown }).constructor !== Float32Array) return false
  return true
}

function clonePlain(source: Object3D): Object3D | null {
  if (!source.visible) return null
  const children: Object3D[] = []
  for (const child of source.children) {
    const next = clonePlain(child)
    if (next) children.push(next)
  }
  if (isPlainExportMesh(source)) {
    const copy = cloneShallow(source)
    if (!copy) return children.length === 0 ? null : withChildren(emptyGroup(source), children)
    copy.visible = true
    return withChildren(copy, children)
  }
  if (children.length === 0) return null
  return withChildren(emptyGroup(source), children)
}

function compact(nodes: Array<Object3D | null>): Object3D[] {
  return nodes.filter((node): node is Object3D => node != null)
}

function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data.byteLength > 0 ? data : null
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView
    const bytes = new ArrayBuffer(view.byteLength)
    new Uint8Array(bytes).set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
    return bytes.byteLength > 0 ? bytes : null
  }
  return null
}

function isGlb(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 12) return false
  const view = new DataView(bytes)
  return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2
}

async function parseSubset(exporter: GlbExporter, subset: Object3D[]): Promise<ArrayBuffer> {
  const data = await exporter.parseAsync(subset, { binary: true, onlyVisible: true })
  const bytes = toArrayBuffer(data)
  if (!bytes || !isGlb(bytes)) throw new Error('glb')
  return bytes
}

async function exportBytes(exporter: GlbExporter, subset: Object3D[]): Promise<{ bytes: ArrayBuffer; recovered: boolean }> {
  try {
    return { bytes: await parseSubset(exporter, subset), recovered: false }
  } catch {
    // 第一轮把写不完整的节点留在原树上。抛了再拿掉它们重试。
  }
  const stripped = compact(subset.map((root) => cloneWithoutGaps(root)))
  if (stripped.length > 0) {
    try {
      return { bytes: await parseSubset(exporter, stripped), recovered: true }
    } catch {
      // 还有非缺口节点也会让导出器崩，最后只留普通网格。
    }
  }
  const plain = compact(subset.map((root) => clonePlain(root)))
  if (plain.length === 0) throw new Error('empty')
  return { bytes: await parseSubset(exporter, plain), recovered: true }
}

export function loadGlbExporter(): Promise<GlbExporter> {
  return import('three/addons/exporters/GLTFExporter.js').then((mod) => {
    const Exporter = (mod as { GLTFExporter: new () => GlbExporter }).GLTFExporter
    return new Exporter()
  })
}

export function downloadGlb(bytes: ArrayBuffer, filename: string) {
  const blob = new Blob([bytes], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function browserPorts(): FloorGlbPorts {
  const state = useTwinStore.getState()
  return {
    view: state.view,
    floorId: state.selectedFloor,
    scene: typeof window === 'undefined' ? null : (window.__twinScene ?? null),
    loadExporter: loadGlbExporter,
    download: downloadGlb,
  }
}

function failed(message: string): FloorGlbResult {
  return { ok: false, partial: false, message }
}

export async function exportCurrentFloorGlb(ports: FloorGlbPorts = browserPorts()): Promise<FloorGlbResult> {
  const floorId = currentFloorId(ports.view, ports.floorId)
  if (!floorId) return failed(FLOOR_GLB_NEED_FLOOR)
  if (!ports.scene) return failed(FLOOR_GLB_EARLY)
  const subset = floorExportRoots(ports.scene, floorId)
  if (subset.length === 0) return failed(FLOOR_GLB_EMPTY)
  const filename = floorGlbFilename(floorId)
  const gaps = visibleExportGaps(subset)
  try {
    const exporter = await ports.loadExporter()
    const { bytes, recovered } = await exportBytes(exporter, subset)
    ports.download(bytes, filename)
    if (!recovered && gaps.length === 0) {
      return { ok: true, partial: false, message: `已下载 ${filename}` }
    }
    return { ok: true, partial: true, message: floorGlbSaved(filename, gaps) }
  } catch {
    return failed(FLOOR_GLB_FAILED)
  }
}
