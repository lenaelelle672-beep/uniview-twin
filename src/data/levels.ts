/**
 * 外壳标高（D085 / D086 / D112）。
 * 数值摘自已删除的 `assets/ready/floors/levels.json` v2
 * （sha256 435a7eb300c979822bce59c68dd9fbcf8811dfdc851da0e10d139870bdc0eb6d）。
 * 运行时不再读楼层 JSON；仓库里只留 a 单的 `public/floors`。
 */

export interface TowerLevelRow {
  floor: string
  level_m: number
  storey_m: number
}

export interface EastLevelRow {
  floor: string
  level_m: number
}

const TOWER_LEVELS: TowerLevelRow[] = [
  { floor: 'F01', level_m: 0, storey_m: 6.85 },
  { floor: 'F02', level_m: 6.85, storey_m: 6 },
  { floor: 'F03', level_m: 12.85, storey_m: 6 },
  { floor: 'F04', level_m: 18.85, storey_m: 4.2 },
  { floor: 'F05', level_m: 23.05, storey_m: 4.2 },
  { floor: 'F06', level_m: 27.25, storey_m: 4.2 },
  { floor: 'F07', level_m: 31.45, storey_m: 4.2 },
  { floor: 'F08', level_m: 35.65, storey_m: 4.303 },
  { floor: 'F09', level_m: 39.953, storey_m: 4.303 },
  { floor: 'F10', level_m: 44.257, storey_m: 4.303 },
  { floor: 'F11', level_m: 48.56, storey_m: 4.303 },
  { floor: 'F12', level_m: 52.863, storey_m: 4.303 },
  { floor: 'F13', level_m: 57.167, storey_m: 4.303 },
  { floor: 'F14', level_m: 61.47, storey_m: 4.303 },
  { floor: 'F15', level_m: 65.773, storey_m: 4.303 },
  { floor: 'F16', level_m: 70.077, storey_m: 4.303 },
  { floor: 'F17', level_m: 74.38, storey_m: 4.303 },
  { floor: 'F18', level_m: 78.683, storey_m: 4.303 },
  { floor: 'F19', level_m: 82.987, storey_m: 4.303 },
  { floor: 'F20', level_m: 87.29, storey_m: 4.303 },
  { floor: 'F21', level_m: 91.593, storey_m: 4.303 },
  { floor: 'F22', level_m: 95.897, storey_m: 4.303 },
]

const EAST_LEVELS: EastLevelRow[] = [
  { floor: 'F01', level_m: 0 },
  { floor: 'F02', level_m: 6.9 },
  { floor: 'F03', level_m: 12.9 },
  { floor: 'F04', level_m: 18.9 },
  { floor: 'F05', level_m: 23.7 },
  { floor: 'F06', level_m: 28.5 },
  { floor: 'F07', level_m: 33.3 },
  { floor: 'F08', level_m: 38.1 },
]

export const LEVELS = {
  tower: TOWER_LEVELS,
  eastBlock: EAST_LEVELS,
  towerRoof_m: 100.2,
  eastBlockRoof_m: 42.9,
  eastBlockParapetTop_m: 45.3,
  curvedRnDRoof_m: 17.65,
  grilleTop_m: 45.5,
}

export const TOWER_ROOF_M = LEVELS.towerRoof_m
/** 女儿墙顶 ≈101.0，外壳做到这里。 */
export const TOWER_PARAPET_TOP_M = 101.0
export const EAST_ROOF_SLAB_M = LEVELS.eastBlockRoof_m
export const EAST_PARAPET_TOP_M = LEVELS.eastBlockParapetTop_m
/** 格栅 v4 底 / 19.6 m 以下缩进裙房（grilleCheck BOX_BOTTOM）。 */
export const EAST_GRILLE_BOTTOM_M = 19.6
export const EAST_GRILLE_TOP_M = LEVELS.grilleTop_m
export const CURVED_RND_ROOF_M = LEVELS.curvedRnDRoof_m

export const FLOOR_HEIGHT_B1_M = 5.5
export const B1_ELEVATION_M = -5.5

export function floorJsonKey(id: string): string {
  if (id === 'B1') return 'B1'
  const level = Number(id.replace(/^F/i, ''))
  if (!Number.isInteger(level) || level < 1 || level > 22) {
    throw new Error(`未知楼层：${id}`)
  }
  return `F${String(level).padStart(2, '0')}`
}

export function towerRow(id: string): TowerLevelRow {
  const key = floorJsonKey(id)
  const row = TOWER_LEVELS.find((item) => item.floor === key)
  if (!row) throw new Error(`缺少塔楼标高 ${key}`)
  return row
}

export function eastRow(id: string): EastLevelRow {
  const key = floorJsonKey(id)
  const row = EAST_LEVELS.find((item) => item.floor === key)
  if (!row) throw new Error(`缺少东侧研发块标高 ${key}`)
  return row
}

/** 东侧 5F 屋面 = 6F 楼面，北翼楼做到这里。 */
export function northWingTopM(): number {
  return eastRow('F6').level_m
}

export function eastFloorBandLevels(): number[] {
  return EAST_LEVELS.filter((row) => row.level_m > 0.1).map((row) => row.level_m)
}
