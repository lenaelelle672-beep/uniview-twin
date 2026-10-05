import levelsJson from '../../assets/ready/floors/levels.json'

/**
 * 标高只从 `assets/ready/floors/levels.json` 读（D085 / D086）。
 * 单层视图用塔楼一组；东侧研发块外壳和楼层条用东侧一组。
 */

type TowerRow = (typeof levelsJson.tower)[number]
type EastRow = (typeof levelsJson.eastBlock)[number]

const levels = levelsJson

export const LEVELS = levels

export const TOWER_ROOF_M = levels.towerRoof_m
/** 女儿墙顶 ≈101.0，外壳做到这里（levels.json towerRoofCheck.aboveRoof）。 */
export const TOWER_PARAPET_TOP_M = 101.0
export const EAST_ROOF_SLAB_M = levels.eastBlockRoof_m
export const EAST_PARAPET_TOP_M = levels.eastBlockParapetTop_m
/** 格栅 v4 底 / 19.6 m 以下缩进裙房（levels.json grilleCheck BOX_BOTTOM）。 */
export const EAST_GRILLE_BOTTOM_M = 19.6
export const EAST_GRILLE_TOP_M = levels.grilleCheck.grilleTop_m
export const CURVED_RND_ROOF_M = levels.curvedRnDRoof_m

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

export function towerRow(id: string): TowerRow {
  const key = floorJsonKey(id)
  const row = levels.tower.find((item) => item.floor === key)
  if (!row) throw new Error(`levels.json 缺少塔楼 ${key}`)
  return row
}

export function eastRow(id: string): EastRow {
  const key = floorJsonKey(id)
  const row = levels.eastBlock.find((item) => item.floor === key)
  if (!row) throw new Error(`levels.json 缺少东侧研发块 ${key}`)
  return row
}

/** 东侧 5F 屋面 = 6F 楼面，北翼楼做到这里。 */
export function northWingTopM(): number {
  return eastRow('F6').level_m
}

export function eastFloorBandLevels(): number[] {
  return levels.eastBlock.filter((row) => row.level_m > 0.1).map((row) => row.level_m)
}
