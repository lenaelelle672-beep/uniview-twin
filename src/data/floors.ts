/** 坐标约定（方案第 3 节）：米，Y 向上，原点为塔楼平面中心地面。+X 东，-Z 北。 */

import {
  B1_ELEVATION_M,
  FLOOR_HEIGHT_B1_M,
  TOWER_ROOF_M as LEVELS_TOWER_ROOF_M,
  towerRow,
} from './levels'

export const TOWER_WIDTH_M = 27
export const TOWER_DEPTH_M = 67
export { FLOOR_HEIGHT_B1_M }
export const FLOOR_HEIGHT_F1_M = towerRow('F1').storey_m
export const FLOOR_HEIGHT_TYPICAL_M = towerRow('F4').storey_m
export const TOWER_ROOF_M = LEVELS_TOWER_ROOF_M

export interface FloorSpec {
  id: string
  name: string
  level: number
  elevation: number
  height: number
}

export function floorIdList(): string[] {
  const ids = ['B1']
  for (let level = 1; level <= 22; level += 1) ids.push(`F${level}`)
  return ids
}

export function isFloorId(value: string): boolean {
  return /^(?:B1|F(?:[1-9]|1[0-9]|2[0-2]))$/.test(value)
}

export function floorSpec(id: string): FloorSpec {
  if (id === 'B1') {
    return {
      id,
      name: '地下一层',
      level: -1,
      elevation: B1_ELEVATION_M,
      height: FLOOR_HEIGHT_B1_M,
    }
  }
  const level = Number(id.slice(1))
  if (!Number.isInteger(level) || level < 1 || level > 22) {
    throw new Error(`未知楼层：${id}`)
  }
  const row = towerRow(id)
  const next = level < 22 ? towerRow(`F${level + 1}`) : null
  return {
    id,
    name: level === 1 ? '一层' : `${level} 层`,
    level,
    elevation: row.level_m,
    height: next ? next.level_m - row.level_m : row.storey_m,
  }
}

export function listFloorSpecs(): FloorSpec[] {
  return floorIdList().map((id) => floorSpec(id))
}
