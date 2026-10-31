import {
  FLOOR_COUNT,
  badgeExplodeOffset,
  readExplodeMotion,
  readStationExplodeMotion,
} from './explode'
import { stationDelta, type LevelFrame } from './stationExplode'

/**
 * T095：徽标和标签只读爆炸时钟。
 * 楼层外壳和工位分包负责 step；这里不重开时钟，和同波 T094 共用 progress。
 * 本文件只从工位晚加载分包引进去，避免把读函数打进首屏。
 */

export interface ExplodeDelta {
  x: number
  y: number
  z: number
}

const ZERO: ExplodeDelta = { x: 0, y: 0, z: 0 }

function knownFloor(id: string): boolean {
  if (id === 'B1') return true
  if (!id.startsWith('F')) return false
  const level = Number(id.slice(1))
  return Number.isInteger(level) && level >= 1 && level <= FLOOR_COUNT - 1
}

/**
 * 楼层竖直进度。
 * 工位分包会再打进一份 explode.ts，那份 readExplodeMotion 没有被外壳 step。
 * 它还停在 0 时，用外壳已经写进 __twinExplode 的进度，和 T094 看的是同一份。
 */
function floorProgress(): number {
  const local = readExplodeMotion()
  if (typeof window === 'undefined') return local.progress
  const bridged = window.__twinReadExplodeMotion?.()
  if (bridged && typeof bridged.progress === 'number') return bridged.progress
  const published = window.__twinExplode?.progress
  if (local.progress === 0 && local.animating === false && typeof published === 'number') return published
  return local.progress
}

/** 楼层竖直抬升。挂在已随外壳移动的组上时不再加，避免叠两次。 */
export function floorBadgeLift(floorId: string, inheritFloorLift: boolean): number {
  if (inheritFloorLift || !knownFloor(floorId)) return 0
  return badgeExplodeOffset(floorId, floorProgress())
}

/**
 * 相对锚点的爆炸增量。
 * 锚点决定工位层（和桌子同一套 frame）；避让偏移加在增量之外，不拿被挤开的点重新分层。
 */
export function badgeExplodeDelta(
  floorId: string,
  anchorX: number,
  anchorZ: number,
  inheritFloorLift: boolean,
  frame: LevelFrame | null,
  out: ExplodeDelta = { x: 0, y: 0, z: 0 },
): ExplodeDelta {
  const progress = readStationExplodeMotion().progress
  const shift = frame ? stationDelta(frame, anchorX, anchorZ) : ZERO
  const t = progress <= 0 ? 0 : progress >= 1 ? 1 : progress
  out.x = shift.x * t
  out.y = shift.y * t + floorBadgeLift(floorId, inheritFloorLift)
  out.z = shift.z * t
  return out
}

/** 避让后的本地点 + 锚点上的爆炸增量。隐藏标签照样改位置，不把它们改成可见。 */
export function composeLabelPoint(
  rest: readonly [number, number, number],
  anchorX: number,
  anchorZ: number,
  floorId: string,
  inheritFloorLift: boolean,
  frame: LevelFrame | null,
): [number, number, number] {
  const delta = badgeExplodeDelta(floorId, anchorX, anchorZ, inheritFloorLift, frame)
  return [rest[0] + delta.x, rest[1] + delta.y, rest[2] + delta.z]
}

/** 总览引线读 __twinExplode.offset。这里用 badgeExplodeOffset 按同一份楼层进度写回去。 */
export function syncFloorBadgeLifts(): void {
  if (typeof window === 'undefined') return
  const floors = window.__twinExplode?.floors
  if (!floors) return
  const progress = floorProgress()
  for (const floor of floors) {
    if (!knownFloor(floor.id)) continue
    floor.offset = badgeExplodeOffset(floor.id, progress)
  }
}

/** 圆标和房间标签写矩阵 / Y 时调用。实现留在工位分包，首屏图不引用本文件。 */
export function installBadgePoseHooks(): void {
  if (typeof window === 'undefined') return
  window.__twinBadgeExplodeDelta = (floorId, anchorX, anchorZ, inheritFloorLift) =>
    badgeExplodeDelta(floorId, anchorX, anchorZ, inheritFloorLift, window.__twinStationFrame ?? null)
}
