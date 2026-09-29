import { describe, expect, it } from 'vitest'
import { floorIdList, floorSpec, listFloorSpecs } from '../data/floors'
import {
  EXPLODE_DURATION_S,
  EXPLODE_GAP_M,
  EXPLODE_GROUND_CLEARANCE_M,
  FLOOR_COUNT,
  explodeOffset,
  explodeProgress,
  floorWorldSpan,
} from './explode'

describe('爆炸位移', () => {
  it('一共 23 层，收拢时每层偏移都是 0', () => {
    expect(listFloorSpecs()).toHaveLength(FLOOR_COUNT)
    expect(floorIdList()).toHaveLength(23)
    for (let index = 0; index < FLOOR_COUNT; index += 1) {
      expect(explodeOffset(index, 0)).toBe(0)
    }
  })

  it('展开后相邻层净距等于间距，且互不重叠', () => {
    const specs = listFloorSpecs()
    const spans = specs.map((spec, index) => floorWorldSpan(spec.elevation, spec.height, index, 1))
    for (let index = 0; index < spans.length - 1; index += 1) {
      const gap = spans[index + 1].bottom - spans[index].top
      expect(gap).toBeCloseTo(EXPLODE_GAP_M, 5)
      expect(gap).toBeGreaterThan(0)
      expect(spans[index].top).toBeLessThan(spans[index + 1].bottom)
    }
  })

  it('B1 被抬到地面以上，F22 比 B1 高出 22 个间距', () => {
    const basement = floorWorldSpan(floorSpec('B1').elevation, floorSpec('B1').height, 0, 1)
    expect(basement.bottom).toBeCloseTo(floorSpec('B1').elevation + EXPLODE_GROUND_CLEARANCE_M, 5)
    expect(basement.bottom).toBeGreaterThan(0)
    expect(explodeOffset(22, 1) - explodeOffset(0, 1)).toBe(22 * EXPLODE_GAP_M)
  })

  it('拒绝越界楼层序号', () => {
    expect(() => explodeOffset(-1, 1)).toThrow(/楼层序号/)
    expect(() => explodeOffset(23, 1)).toThrow(/楼层序号/)
  })

  it('0.8 秒内用 maath 曲线走完，结束时精确落到目标', () => {
    expect(explodeProgress(0, 1, 0)).toBe(0)
    expect(explodeProgress(0.4, 1, 0)).toBe(0.4)
    expect(explodeProgress(0, 1, EXPLODE_DURATION_S)).toBe(1)
    expect(explodeProgress(1, 0, EXPLODE_DURATION_S)).toBe(0)
    expect(explodeProgress(0, 1, EXPLODE_DURATION_S + 2)).toBe(1)
    const mid = explodeProgress(0, 1, EXPLODE_DURATION_S / 2)
    expect(mid).toBeGreaterThan(0.5)
    expect(mid).toBeLessThan(1)
    const back = explodeProgress(1, 0, EXPLODE_DURATION_S / 2)
    expect(back).toBeLessThan(0.5)
    expect(back).toBeGreaterThan(0)
  })
})
