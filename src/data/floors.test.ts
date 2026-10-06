import { describe, expect, it } from 'vitest'
import { floorSpec, listFloorSpecs, TOWER_ROOF_M } from './floors'
import {
  CURVED_RND_ROOF_M,
  EAST_GRILLE_BOTTOM_M,
  EAST_PARAPET_TOP_M,
  LEVELS,
  northWingTopM,
  towerRow,
} from './levels'

describe('外壳标高常量', () => {
  it('塔楼标高来自 levels.ts 常量，屋面 100.2', () => {
    expect(TOWER_ROOF_M).toBe(LEVELS.towerRoof_m)
    expect(TOWER_ROOF_M).toBeCloseTo(100.2, 5)
    expect(floorSpec('F1').elevation).toBe(0)
    expect(floorSpec('F1').height).toBe(towerRow('F1').storey_m)
    expect(floorSpec('F8').elevation).toBeCloseTo(35.65, 5)
    expect(floorSpec('F13').elevation).toBe(towerRow('F13').level_m)
    expect(listFloorSpecs()).toHaveLength(23)
  })

  it('东侧研发块和弧形研发中心标高也来自 levels.ts 常量', () => {
    expect(EAST_PARAPET_TOP_M).toBe(LEVELS.eastBlockParapetTop_m)
    expect(EAST_PARAPET_TOP_M).toBeCloseTo(45.3, 5)
    expect(CURVED_RND_ROOF_M).toBeCloseTo(17.65, 5)
    expect(EAST_GRILLE_BOTTOM_M).toBeCloseTo(19.6, 5)
    expect(northWingTopM()).toBeCloseTo(28.5, 5)
  })
})
