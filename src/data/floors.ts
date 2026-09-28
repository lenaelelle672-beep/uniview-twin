/** 坐标约定（方案第 3 节）：米，Y 向上，原点为塔楼平面中心地面。+X 东，-Z 北。 */

export const TOWER_WIDTH_M = 27
export const TOWER_DEPTH_M = 67
export const FLOOR_HEIGHT_B1_M = 5.5
export const FLOOR_HEIGHT_F1_M = 6
export const FLOOR_HEIGHT_TYPICAL_M = 4.2
export const TOWER_ROOF_M = 94.2

const B1_ELEVATION_TENTHS = -55
const F1_HEIGHT_TENTHS = 60
const TYPICAL_HEIGHT_TENTHS = 42

export interface FloorSpec {
  id: string
  name: string
  level: number
  elevation: number
  height: number
}

function fromTenths(tenths: number): number {
  return tenths / 10
}

export function floorIdList(): string[] {
  const ids = ['B1']
  for (let level = 1; level <= 22; level += 1) ids.push(`F${level}`)
  return ids
}

export function isFloorId(value: string): boolean {
  return /^(?:B1|F(?:[1-9]|1\d|2[0-2]))$/.test(value)
}

export function floorSpec(id: string): FloorSpec {
  if (id === 'B1') {
    return {
      id,
      name: '地下一层',
      level: -1,
      elevation: fromTenths(B1_ELEVATION_TENTHS),
      height: FLOOR_HEIGHT_B1_M,
    }
  }
  const level = Number(id.slice(1))
  if (!Number.isInteger(level) || level < 1 || level > 22) {
    throw new Error(`未知楼层：${id}`)
  }
  const elevationTenths = level === 1 ? 0 : F1_HEIGHT_TENTHS + (level - 2) * TYPICAL_HEIGHT_TENTHS
  const heightTenths = level === 1 ? F1_HEIGHT_TENTHS : TYPICAL_HEIGHT_TENTHS
  return {
    id,
    name: level === 1 ? '一层' : `${level} 层`,
    level,
    elevation: fromTenths(elevationTenths),
    height: fromTenths(heightTenths),
  }
}

export function listFloorSpecs(): FloorSpec[] {
  return floorIdList().map((id) => floorSpec(id))
}
