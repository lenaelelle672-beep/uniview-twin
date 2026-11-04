import { isFloorId } from '../data/floors'

/**
 * T117：单枚选中工位的视口适配。
 * drei Resize（10.7.9）的 width/height/depth 是布尔：选一条轴，否则取最长边，
 * 然后 `scale.setScalar(1 / dimension)`，把载体归一成 1。
 * 视口尺寸写在我们自己的父组上，不写 InstancedMesh，也不写爆炸矩阵。
 * 默认关。和 T070 对焦装入（飞镜头）互斥：那边在飞，这边不缩放。
 */

/** 与软阴影、天幕、dock 同一道首帧后窗口。字面量写在这里，懒包不引 three。 */
export const RESIZE_FIT_AFTER_FIRST_MS = 2600

/** 最长边占当前视口较短边的比例。 */
export const RESIZE_FIT_FILL = 0.36

/** 视口推出来的世界尺寸夹在这个范围，避免贴脸或把整栋楼撑满。 */
export const RESIZE_FIT_MIN_M = 0.8
export const RESIZE_FIT_MAX_M = 48

const EXPLODE_EPS = 1e-3

/** 演示载体的外形，米。不是工位实例，Resize 只量这块。 */
export const RESIZE_CARRIER_M = { x: 1.4, y: 1.2, z: 1.4 } as const

export const RESIZE_CARRIER_COLOR = '#2fbf86'

/**
 * 和飞镜头、爆炸分层，开关各自独立；真正缩放时互斥。
 * 实例矩阵和 Html 不碰。
 */
export const RESIZE_FIT_LAYERS = {
  focusFit: 'exclusive',
  explode: 'exclusive',
  stationExplode: 'exclusive',
  tour: 'exclusive',
  instancedMatrix: 'forbidden',
  html: 'forbidden',
} as const

export interface ResizeQuery {
  view: string
  floorId: string | null
  focusedDeskId: string | null
  boxFloorId: string | null
  boxDeskIds: readonly string[]
  optIn: boolean
  due: boolean
  touring: boolean
  focusMode: 'off' | 'center' | 'bounds'
  focusResident: boolean
  exploded: boolean
  explodeProgress: number
  explodeAnimating: boolean
  stationActive: boolean
  stationAnimating: boolean
  stationProgress: number
}

export type ResizeFitState =
  | 'on'
  | 'pending'
  | 'off-switch'
  | 'off-view'
  | 'off-empty'
  | 'off-multi'
  | 'yield-focus'
  | 'yield-explode'
  | 'yield-station'
  | 'yield-tour'

export type ResizeSelection = { kind: 'one'; deskId: string } | { kind: 'multi' } | { kind: 'none' }

export interface Vec3 {
  x: number
  y: number
  z: number
}

export function deskFloorId(deskId: string): string | null {
  const splitAt = deskId.lastIndexOf('-')
  if (splitAt <= 0) return null
  const floorId = deskId.slice(0, splitAt)
  return isFloorId(floorId) ? floorId : null
}

/** 只收当前层上的一枚。框选多于一枚就放弃，不缩成一组。 */
export function resizeSelection(query: Pick<ResizeQuery, 'floorId' | 'focusedDeskId' | 'boxFloorId' | 'boxDeskIds'>): ResizeSelection {
  const floorId = query.floorId
  if (!floorId || !isFloorId(floorId)) return { kind: 'none' }
  if (query.boxFloorId === floorId && query.boxDeskIds.length > 0) {
    const ids = query.boxDeskIds.filter((id) => deskFloorId(id) === floorId)
    if (ids.length > 1) return { kind: 'multi' }
    if (ids.length === 1) return { kind: 'one', deskId: ids[0] ?? '' }
    return { kind: 'none' }
  }
  if (query.focusedDeskId && deskFloorId(query.focusedDeskId) === floorId) {
    return { kind: 'one', deskId: query.focusedDeskId }
  }
  return { kind: 'none' }
}

/**
 * 开关默认关。开了也要等首帧窗口，并且只在单层、单枚、没在飞镜头、没在炸开时缩放。
 * 对焦装入、楼层爆炸、工位拆解、巡游各自让位，不关用户的开关。
 */
export function resizeFitState(query: ResizeQuery): ResizeFitState {
  if (!query.optIn) return 'off-switch'
  if (!query.due) return 'pending'
  if (query.touring) return 'yield-tour'
  if (query.view !== 'floor') return 'off-view'
  if (query.exploded || query.explodeAnimating || query.explodeProgress > EXPLODE_EPS) return 'yield-explode'
  if (query.stationActive || query.stationAnimating || query.stationProgress > EXPLODE_EPS) return 'yield-station'
  if (query.focusMode !== 'off' || query.focusResident) return 'yield-focus'
  const selection = resizeSelection(query)
  if (selection.kind === 'multi') return 'off-multi'
  if (selection.kind === 'none') return 'off-empty'
  return 'on'
}

export function resizeDeskId(query: ResizeQuery): string | null {
  if (resizeFitState(query) !== 'on') return null
  const selection = resizeSelection(query)
  return selection.kind === 'one' ? selection.deskId : null
}

/** 盒子中心抬到台面之上，几何本身仍以原点为中心，方便 Resize 绕落点缩放。 */
export function carrierPosition(anchor: Vec3): Vec3 {
  return { x: anchor.x, y: anchor.y + RESIZE_CARRIER_M.y / 2, z: anchor.z }
}

export function resizeFitChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= RESIZE_FIT_AFTER_FIRST_MS
}

/** 窗口过了一次就一直算过。爆炸会清掉首帧标记，缩放不因此卡在待挂。 */
export function resizeFitDueLatched(latched: boolean, firstFrameAt: number | null | undefined, now: number): boolean {
  return latched || resizeFitChunkDue(firstFrameAt, now)
}

/**
 * 透视相机在目标距离上，较短边的 fill 比例对应的世界长度。
 * drei Resize 把最长边收成 1，调用方把这个长度写进自己的父组 scale。
 */
export function viewportFitMeters(fovDeg: number, aspect: number, distance: number, fill: number = RESIZE_FIT_FILL): number | null {
  if (!(fovDeg > 0 && fovDeg < 180)) return null
  if (!(aspect > 0) || !Number.isFinite(aspect)) return null
  if (!(distance > 0) || !Number.isFinite(distance)) return null
  if (!(fill > 0 && fill <= 1)) return null
  const height = 2 * Math.tan((fovDeg * Math.PI) / 360) * distance
  const width = height * aspect
  const span = Math.min(width, height) * fill
  if (!Number.isFinite(span) || span <= 0) return null
  return Math.min(RESIZE_FIT_MAX_M, Math.max(RESIZE_FIT_MIN_M, span))
}

export function perspectiveFitMeters(
  camera: {
    isPerspectiveCamera?: boolean
    fov?: number
    aspect?: number
    position?: { x: number; y: number; z: number }
  },
  target: Vec3,
): number | null {
  if (camera.isPerspectiveCamera !== true) return null
  if (typeof camera.fov !== 'number' || typeof camera.aspect !== 'number' || !camera.position) return null
  const distance = Math.hypot(camera.position.x - target.x, camera.position.y - target.y, camera.position.z - target.z)
  return viewportFitMeters(camera.fov, camera.aspect, distance)
}

/** `?resizeFit=1` 才打开。缺省和其他值都关。 */
export function resizeFitOptIn(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('resizeFit') === '1'
}

export function searchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 resizeFit。开关分包晚于同步，所以也看启动地址。 */
export function resizeFitOptInAtBoot(live: string, navigationUrl: string): boolean {
  return resizeFitOptIn(live) || resizeFitOptIn(searchOfUrl(navigationUrl))
}
