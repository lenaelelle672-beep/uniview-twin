import { floorSpec } from '../data/floors'
import { TOWER_OUTLINE_BOUNDS } from '../scene/shell/rings'
import { TOUR_POINT_CAP } from './caps'

/**
 * 讲解相机轨的控制点。跟告警导览同一套楼层标高，但在东南侧绕开塔身，
 * 让总览镜头看见一条上升的曲线。不是走廊人流，也不读人流折线。
 * 数组只建一次。drei Line 在 points 换引用时会把 LineMaterial dispose 掉且不新建（D272）。
 */

const BEATS = ['B1', 'F1', 'F6', 'F12', 'F18', 'F22'] as const
const ANGLES = [-0.42, -0.24, -0.06, 0.12, 0.3, 0.46] as const
const RADIUS_M = 48
const EYE_LIFT_M = 8

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function buildTourPoints(): Array<[number, number, number]> {
  if (BEATS.length > TOUR_POINT_CAP) throw new Error('导览轨控制点超过封顶')
  const cx = (TOWER_OUTLINE_BOUNDS.minX + TOWER_OUTLINE_BOUNDS.maxX) / 2
  const cz = (TOWER_OUTLINE_BOUNDS.minZ + TOWER_OUTLINE_BOUNDS.maxZ) / 2
  return BEATS.map((id, index) => {
    const spec = floorSpec(id)
    const y = spec.elevation + spec.height * 0.45 + EYE_LIFT_M
    const angle = ANGLES[index] ?? 0
    return [
      round3(cx + Math.sin(angle) * RADIUS_M),
      round3(y),
      round3(cz + Math.cos(angle) * RADIUS_M),
    ]
  })
}

let cached: ReadonlyArray<readonly [number, number, number]> | null = null

export function tourPreviewPoints(): ReadonlyArray<readonly [number, number, number]> {
  if (!cached) cached = buildTourPoints()
  return cached
}
