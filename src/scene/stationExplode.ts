import { EXPLODE_DURATION_S, resetStationExplodeMotion, stepStationExplodeMotion, type ExplodeMotion } from './explode'

/**
 * 工位级拆解。对标 APS「按层只沿一根轴拉开」：
 * 把实例平移按带聚成层，预烘焙 rest / explode 两份矩阵，动画只插值平移。
 * 不新建网格，不写 Object3D.position。
 *
 * 层间距按工位排距（约 2.2 m）取一截，全开时相邻层再分开这么多。
 */
export const STATION_LEVEL_BAND_M = 0.6
export const STATION_EXPLODE_GAP_M = 1.6

/** WebGL DYNAMIC_DRAW。不从 three 再引一份常量，避免晚加载分包拷进渲染器。 */
export const STATION_DYNAMIC_DRAW = 35048

export interface Mat4 {
  elements: number[]
}

export interface LevelFrame {
  axis: 'x' | 'z'
  band: number
  gap: number
  /** 已排序的量化键。下标就是层号。 */
  keys: number[]
  /** 只有一层时改走径向，否则同层工位拆不开。 */
  radial: boolean
  originX: number
  originZ: number
}

export interface StationPair {
  rest: Mat4
  explode: Mat4
}

export interface StationTick {
  motion: ExplodeMotion
  /** 调用方本帧应当写矩阵。落到 0 或 1 之后不再每帧写。 */
  write: boolean
  /** 本帧要从当前实例重新烘焙。拉开刚开始时抓 rest，中途不从已拉开的矩阵再抓。 */
  capture: boolean
}

const scratch: Mat4 = { elements: new Array<number>(16).fill(0) }

export function translationOf(matrix: Mat4): { x: number; y: number; z: number } {
  const e = matrix.elements
  return { x: e[12], y: e[13], z: e[14] }
}

export function copyMatrix(matrix: Mat4): Mat4 {
  return { elements: matrix.elements.slice() }
}

export function matrixFromArray(array: ArrayLike<number>, index: number): Mat4 {
  const elements = new Array<number>(16)
  const offset = index * 16
  for (let i = 0; i < 16; i += 1) elements[i] = array[offset + i] ?? 0
  return { elements }
}

/** 列主序，绕 Y。只给测试和径向烘焙用。 */
export function matrixWithTranslation(x: number, y: number, z: number, rotY = 0): Mat4 {
  const c = Math.cos(rotY)
  const s = Math.sin(rotY)
  return { elements: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1] }
}

export function chooseLevelAxis(points: Array<{ x: number; z: number }>, band: number): 'x' | 'z' {
  const xKeys = new Set<number>()
  const zKeys = new Set<number>()
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of points) {
    xKeys.add(Math.round(point.x / band))
    zKeys.add(Math.round(point.z / band))
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.z < minZ) minZ = point.z
    if (point.z > maxZ) maxZ = point.z
  }
  if (zKeys.size > xKeys.size) return 'z'
  if (xKeys.size > zKeys.size) return 'x'
  return maxZ - minZ > maxX - minX ? 'z' : 'x'
}

export function levelFrame(points: Array<{ x: number; z: number }>, band = STATION_LEVEL_BAND_M, gap = STATION_EXPLODE_GAP_M): LevelFrame {
  let originX = 0
  let originZ = 0
  for (const point of points) {
    originX += point.x
    originZ += point.z
  }
  if (points.length > 0) {
    originX /= points.length
    originZ /= points.length
  }
  const axis = chooseLevelAxis(points, band)
  const keys = new Set<number>()
  for (const point of points) {
    const value = axis === 'z' ? point.z : point.x
    keys.add(Math.round(value / band))
  }
  const sorted = [...keys].sort((a, b) => a - b)
  return {
    axis,
    band,
    gap,
    keys: sorted,
    radial: sorted.length <= 1,
    originX,
    originZ,
  }
}

export function levelRank(frame: LevelFrame, x: number, z: number): number {
  const value = frame.axis === 'z' ? z : x
  const key = Math.round(value / frame.band)
  const exact = frame.keys.indexOf(key)
  if (exact >= 0) return exact
  let best = 0
  let bestDist = Infinity
  for (let index = 0; index < frame.keys.length; index += 1) {
    const dist = Math.abs((frame.keys[index] ?? key) - key)
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
  }
  return best
}

/** 全开时相对 rest 的平移。轴向层绕中层对称；单层改径向。 */
export function stationDelta(frame: LevelFrame, x: number, z: number): { x: number; y: number; z: number } {
  if (frame.radial || frame.keys.length <= 1) {
    const dx = x - frame.originX
    const dz = z - frame.originZ
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) return { x: 0, y: 0, z: 0 }
    return { x: (dx / len) * frame.gap, y: 0, z: (dz / len) * frame.gap }
  }
  const rank = levelRank(frame, x, z)
  const mid = (frame.keys.length - 1) / 2
  const shift = (rank - mid) * frame.gap
  return frame.axis === 'x' ? { x: shift, y: 0, z: 0 } : { x: 0, y: 0, z: shift }
}

export function bakeStationPairs(rests: Mat4[], frame?: LevelFrame): { frame: LevelFrame; pairs: StationPair[] } {
  const points = rests.map(translationOf)
  const resolved = frame ?? levelFrame(points)
  const pairs = rests.map((rest) => {
    const t = translationOf(rest)
    const delta = stationDelta(resolved, t.x, t.z)
    const explode = copyMatrix(rest)
    explode.elements[12] = t.x + delta.x
    explode.elements[13] = t.y + delta.y
    explode.elements[14] = t.z + delta.z
    return { rest: copyMatrix(rest), explode }
  })
  return { frame: resolved, pairs }
}

/** 旋转和缩放留在 rest。只插值平移列，进度 0 和 1 精确落回两端。 */
export function lerpStationMatrix(rest: Mat4, explode: Mat4, progress: number, out: Mat4 = scratch): Mat4 {
  const a = rest.elements
  const b = explode.elements
  const e = out.elements
  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress
  for (let i = 0; i < 12; i += 1) e[i] = a[i]
  e[12] = a[12] + (b[12] - a[12]) * t
  e[13] = a[13] + (b[13] - a[13]) * t
  e[14] = a[14] + (b[14] - a[14]) * t
  e[15] = a[15]
  return out
}

export interface MatrixHandle {
  elements: number[]
  toArray: (target: { [index: number]: number }, offset?: number) => { [index: number]: number }
}

export function matrixHandle(elements: number[]): MatrixHandle {
  return {
    elements,
    toArray(target, offset = 0) {
      for (let i = 0; i < 16; i += 1) target[offset + i] = elements[i]
      return target
    },
  }
}

export interface InstanceSink {
  count: number
  setMatrixAt: (index: number, matrix: MatrixHandle) => void
  instanceMatrix?: { needsUpdate: boolean; setUsage?: (usage: number) => void }
}

/**
 * 一个网格一批 setMatrixAt，随后 instanceMatrix.needsUpdate 只置一次。
 * 返回写出的实例数。
 */
export function applyStationProgress(sink: InstanceSink, pairs: StationPair[], progress: number): number {
  const count = Math.min(sink.count, pairs.length)
  const handle = matrixHandle(scratch.elements)
  for (let index = 0; index < count; index += 1) {
    const pair = pairs[index]
    if (!pair) continue
    lerpStationMatrix(pair.rest, pair.explode, progress, scratch)
    sink.setMatrixAt(index, handle)
  }
  if (count > 0 && sink.instanceMatrix) sink.instanceMatrix.needsUpdate = true
  return count
}

export function markStationDynamic(sink: InstanceSink): void {
  sink.instanceMatrix?.setUsage?.(STATION_DYNAMIC_DRAW)
}

export interface MemberSink {
  matrix: { elements: { [index: number]: number } }
  matrixAutoUpdate?: boolean
  matrixWorldNeedsUpdate?: boolean
  position?: { set: (x: number, y: number, z: number) => void }
  updateMatrix?: () => void
  userData?: {
    explodeRest?: [number, number, number]
    explodeAnchor?: [number, number]
    inheritFloorLift?: boolean
    labelPoseOwned?: boolean
  }
}

/** 标签成员没有实例槽时，直接改矩阵平移列。不碰 position，不逐个 needsUpdate。 */
export function applyMemberProgress(members: MemberSink[], pairs: StationPair[], progress: number): number {
  const count = Math.min(members.length, pairs.length)
  for (let index = 0; index < count; index += 1) {
    const pair = pairs[index]
    const member = members[index]
    if (!pair || !member) continue
    lerpStationMatrix(pair.rest, pair.explode, progress, scratch)
    const target = member.matrix.elements
    target[12] = scratch.elements[12]
    target[13] = scratch.elements[13]
    target[14] = scratch.elements[14]
    member.matrixAutoUpdate = false
    member.matrixWorldNeedsUpdate = true
  }
  return count
}

/**
 * 决定这一帧写不写、要不要重新抓 rest。
 * 离开楼层时 stepStationExplodeMotion 已经把进度打成 0。
 * 单层收拢不走 0.8 秒尾巴：昼景停稳后再要帧会被截住，采样时还剩大约 0.03，圆标离 rest 超过 0.08。
 */
export function stationTick(
  posed: boolean,
  captured: boolean,
  settled: boolean,
  exploded: boolean,
  view: string,
  now: number,
): StationTick & { posed: boolean; captured: boolean; settled: boolean } {
  let motion = stepStationExplodeMotion(exploded, view, now)
  if (view === 'floor' && !exploded && (motion.animating || motion.progress !== 0)) {
    resetStationExplodeMotion()
    motion = { progress: 0, animating: false }
  }
  const live = motion.animating || motion.progress !== 0
  if (!live) {
    return { motion, write: posed, capture: false, posed: false, captured: false, settled: false }
  }
  if (!motion.animating && settled) {
    return { motion, write: false, capture: false, posed: true, captured: true, settled: true }
  }
  return {
    motion,
    write: true,
    capture: !captured,
    posed: true,
    captured: true,
    settled: !motion.animating,
  }
}

export { EXPLODE_DURATION_S }
