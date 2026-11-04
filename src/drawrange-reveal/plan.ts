/**
 * T112：室内楼板和合并核心筒用 setDrawRange 渐进显形。
 * 只读几何上的字段，不 import three，分包里不带 three。
 */

/** 显形时长。和进层滑行的 smoothTime 0.42 对齐，落在 1500ms 停稳超时之内。 */
export const DRAW_RANGE_REVEAL_MS = 420

/** 进层后找这一组。楼层 JSON、预构建缓存、B1 都叫这个名字。 */
export const DRAW_RANGE_REVEAL_ROOT = 'FloorInterior'

/** extrudeUp 的楼板，以及 mergeGeometries 合成一块的核心筒壳。墙柱工位是实例化网格，不在这里。 */
export const DRAW_RANGE_REVEAL_NAMES: readonly string[] = ['FloorSlab', 'FloorCores']

/** 一次 drawRange 推进按整三角形走，不画半个面。 */
const TRIANGLE = 3

export interface RangeGeometry {
  isBufferGeometry?: boolean
  isInstancedBufferGeometry?: boolean
  drawRange: { start: number; count: number }
  setDrawRange: (start: number, count: number) => void
  index?: { count: number } | null
  attributes?: { position?: { count: number } }
}

export type RenderHook = (...args: unknown[]) => void

export interface RangeMesh {
  name: string
  parent?: RangeMesh | null
  children?: RangeMesh[]
  isMesh?: boolean
  isInstancedMesh?: boolean
  isBatchedMesh?: boolean
  isSkinnedMesh?: boolean
  geometry?: RangeGeometry | null
  onBeforeRender?: RenderHook
  onAfterRender?: RenderHook
  getObjectByName?: (name: string) => RangeMesh | undefined
}

/** 有索引时 drawRange 数索引，没有时数顶点。实例数不是这个单位。 */
export function drawableCount(geometry: RangeGeometry | null | undefined): number {
  if (!geometry) return 0
  const index = geometry.index
  if (index) return Math.max(0, index.count | 0)
  return Math.max(0, geometry.attributes?.position?.count ?? 0)
}

/**
 * 只收普通 Mesh。InstancedMesh 的 count 是实例数，BatchedMesh 走自己的多段绘制，
 * troika 文字是 InstancedBufferGeometry，三者的 drawRange 都不是「画到第几个三角形」。
 * 已经有人改过 drawRange 的几何也不碰。
 */
export function revealableMesh(mesh: RangeMesh | null | undefined): mesh is RangeMesh & { geometry: RangeGeometry } {
  if (!mesh || mesh.isMesh !== true) return false
  if (mesh.isInstancedMesh || mesh.isBatchedMesh || mesh.isSkinnedMesh) return false
  const geometry = mesh.geometry
  if (!geometry || geometry.isBufferGeometry !== true || geometry.isInstancedBufferGeometry) return false
  if (typeof geometry.setDrawRange !== 'function') return false
  const range = geometry.drawRange
  if (!range || range.start !== 0 || range.count !== Infinity) return false
  return drawableCount(geometry) >= TRIANGLE
}

/** 楼层里那两块网格。同一几何只收一次。 */
export function collectRevealMeshes(interior: RangeMesh | null | undefined): RangeMesh[] {
  if (!interior) return []
  const found: RangeMesh[] = []
  const seen = new Set<RangeGeometry>()
  const visit = (node: RangeMesh) => {
    if (DRAW_RANGE_REVEAL_NAMES.includes(node.name) && revealableMesh(node) && !seen.has(node.geometry)) {
      seen.add(node.geometry)
      found.push(node)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(interior)
  return found
}

export function easeReveal(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0
  if (t >= 1) return 1
  const rest = 1 - t
  return 1 - rest * rest * rest
}

/** 这一帧画到第几个索引（或顶点）。向下取整到三角形。 */
export function revealCount(total: number, progress: number): number {
  const whole = Math.max(0, Math.floor(total / TRIANGLE)) * TRIANGLE
  if (progress >= 1) return whole
  return Math.min(whole, Math.floor((whole * easeReveal(progress)) / TRIANGLE) * TRIANGLE)
}

/** late：分包挂上时这一层已经画出来了，不再藏起来重画。 */
export type RevealSkip = 'view' | 'overlay' | 'night' | 'reduced-motion' | 'hidden' | 'station' | 'late'

export interface RevealGate {
  view: string | undefined
  /** AssetLoadOverlay 还在。加载条那道门闩没落下就不显形。 */
  overlay: boolean
  night: boolean
  reducedMotion: boolean
  hidden: boolean
  stationBusy: boolean
}

/**
 * 新室内第一次出现这一拍要不要显形。null 表示可以开始。
 * 镜头是否在滑不在这里判：首次进层时 FloorStageCamera 要等 FloorPlate 出现后的下一拍才 beginCameraMove。
 * 能不能续帧留到绘制时看 R3F 的 frames。
 * 夜景单层飞入会被 cameraRest 的 idle-snap 一步收到终点，空闲门随后推迟续帧，直接不开。
 */
export function revealSkip(gate: RevealGate): RevealSkip | null {
  if (gate.view !== 'floor') return 'view'
  if (gate.hidden) return 'hidden'
  if (gate.overlay) return 'overlay'
  if (gate.reducedMotion) return 'reduced-motion'
  if (gate.night) return 'night'
  if (gate.stationBusy) return 'station'
  return null
}

export type RevealEnd = 'done' | 'view' | 'detached' | 'hidden' | 'no-frame' | 'watchdog'

export interface RevealTick {
  now: number
  startedAt: number
  view: string | undefined
  attached: boolean
  hidden: boolean
}

/** 显形中每一帧的判定。返回结束原因，或这一帧的进度。 */
export function revealTick(tick: RevealTick): { end: RevealEnd } | { progress: number } {
  if (tick.view !== 'floor') return { end: 'view' }
  if (!tick.attached) return { end: 'detached' }
  if (tick.hidden) return { end: 'hidden' }
  const progress = (tick.now - tick.startedAt) / DRAW_RANGE_REVEAL_MS
  if (!Number.isFinite(progress) || progress >= 1) return { end: 'done' }
  return { progress: Math.max(0, progress) }
}
