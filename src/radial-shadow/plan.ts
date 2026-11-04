/**
 * T120：少量家具 / 选中工位脚下的径向投影阴影。
 * drei Shadow 用 canvas 径向渐变贴在一张水平面上，源码没有 useFrame。
 * 默认关。不代替 balancedFx 里的 ContactShadows，也不代替 SoftShadows。
 * 不进 balancedFx。爆炸和工位拆解时整组卸掉，不跟着矩阵逐帧挪。
 */

/** 与软阴影、点云、dock 同一道首帧后窗口。字面量写在这里，懒包不再去引那份模块。 */
export const RADIAL_SHADOW_AFTER_FIRST_MS = 2600

/**
 * 硬顶。和 Kenney 种子桌数对齐：每张种子桌一块，选中件若在种子外就换掉最后一席。
 * 再多就会在楼板上叠透明面。
 */
export const RADIAL_SHADOW_CAP = 4

/** 1×1 平面的均匀缩放，直径大约盖住桌面并漫到椅脚。 */
export const RADIAL_SHADOW_SCALE = 1.9

/** 贴在楼板表面之上，躲开和楼板共面的闪烁。不抬进桌面。 */
export const RADIAL_SHADOW_LIFT = 0.012

/**
 * 圆斑比楼板只高 1.2 厘米。楼板、热力色和切层封盖都把多边形往相机拉，
 * 深度测试会把整张圆斑丢掉。这里再往相机多拉一档，仍低于桌面，不会穿透显示器。
 */
export const RADIAL_SHADOW_POLYGON_OFFSET = -4

/** 圆心不透明、边缘透明。比接触阴影的 0.45 再收一点，避免叠成第二张接触影。 */
export const RADIAL_SHADOW_OPACITY = 0.4

export const RADIAL_SHADOW_COLOR = '#1a1714'

/** drei 默认也是 0：圆心即色，半径尽头才完全透明。 */
export const RADIAL_SHADOW_COLOR_STOP = 0

export const RADIAL_SHADOW_LAYERS = {
  contactShadows: 'separate',
  softShadows: 'separate',
  balancedFx: 'forbidden',
  explode: 'unmount',
  stationExplode: 'unmount',
  instancedMatrix: 'forbidden',
  furniture: 'seed-desks',
  selected: 'single-desk',
} as const

const EXPLODE_EPS = 1e-3

export type RadialShadowState =
  | 'on'
  | 'pending'
  | 'off-switch'
  | 'off-view'
  | 'off-empty'
  | 'yield-explode'
  | 'yield-station'

export interface RadialShadowGate {
  view: string
  floorId: string | null
  optIn: boolean
  due: boolean
  exploded: boolean
  explodeProgress: number
  explodeAnimating: boolean
  stationActive: boolean
  stationAnimating: boolean
  stationProgress: number
  deskCount: number
}

export interface RadialDeskId {
  id: string
}

/** `F12-66` 属于 F12，`F12-66` 不属于 F1。 */
export function deskOnFloor(floorId: string, deskId: string): boolean {
  const prefix = `${floorId}-`
  if (!deskId.startsWith(prefix)) return false
  return /^[1-9]\d*$/.test(deskId.slice(prefix.length))
}

/**
 * 框选恰好一枚时用它。多枚不把每张都铺上影子。
 * 没有框选时用侧栏聚焦的那一枚。不在本层的编号丢掉。
 */
export function selectedDeskId(
  floorId: string | null,
  focusedDeskId: string | null,
  boxFloorId: string | null,
  boxDeskIds: readonly string[],
): string | null {
  if (!floorId) return null
  if (boxFloorId === floorId && boxDeskIds.length > 1) return null
  if (boxFloorId === floorId && boxDeskIds.length === 1) {
    const id = boxDeskIds[0] ?? ''
    return deskOnFloor(floorId, id) ? id : null
  }
  if (focusedDeskId && deskOnFloor(floorId, focusedDeskId)) return focusedDeskId
  return null
}

/**
 * 先取本层工位表的前几张，这就是 Kenney 种子桌的同一顺序。
 * 选中件已经在里面就不多铺一张。在表里但不在种子里时，换掉最后一席，总数仍不超过 cap。
 * 选中编号不在本层表里则忽略。
 */
export function radialShadowDeskIds(
  desks: readonly RadialDeskId[],
  selectedId: string | null,
  cap = RADIAL_SHADOW_CAP,
): string[] {
  if (cap < 1) return []
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const desk of desks) {
    if (!desk.id || seen.has(desk.id)) continue
    seen.add(desk.id)
    ordered.push(desk.id)
  }
  const seed = ordered.slice(0, cap)
  if (!selectedId || !seen.has(selectedId) || seed.includes(selectedId)) return seed
  if (seed.length < cap) return [...seed, selectedId]
  return [...seed.slice(0, cap - 1), selectedId]
}

/**
 * 开关默认关。开了也要等首帧窗口，并且只在单层、有工位表、没在炸开时铺。
 * 昼夜和画质都不进这道门：这是贴地圆斑，不是接触阴影那条均衡档路径。
 */
export function radialShadowState(gate: RadialShadowGate): RadialShadowState {
  if (!gate.optIn) return 'off-switch'
  if (!gate.due) return 'pending'
  if (gate.view !== 'floor' || !gate.floorId) return 'off-view'
  if (gate.exploded || gate.explodeAnimating || gate.explodeProgress > EXPLODE_EPS) return 'yield-explode'
  if (gate.stationActive || gate.stationAnimating || gate.stationProgress > EXPLODE_EPS) return 'yield-station'
  if (gate.deskCount < 1) return 'off-empty'
  return 'on'
}

export function radialShadowChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= RADIAL_SHADOW_AFTER_FIRST_MS
}

/** 窗口过了一次就一直算过。爆炸会清掉首帧标记，影子不因此卡在待挂。 */
export function radialShadowDueLatched(latched: boolean, firstFrameAt: number | null | undefined, now: number): boolean {
  return latched || radialShadowChunkDue(firstFrameAt, now)
}

/** `?radialShadow=1` 才打开。缺省和其他值都关。 */
export function radialShadowOptIn(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('radialShadow') === '1'
}

export function radialShadowSearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 radialShadow。开关分包晚于同步，所以也看启动地址。 */
export function radialShadowOptInAtBoot(live: string, navigationUrl: string): boolean {
  return radialShadowOptIn(live) || radialShadowOptIn(radialShadowSearchOfUrl(navigationUrl))
}
