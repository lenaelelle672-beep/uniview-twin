import { afterEach, describe, expect, it } from 'vitest'
import { floorIdList, floorSpec, listFloorSpecs } from '../data/floors'
import {
  EXPLODE_DURATION_S,
  EXPLODE_GAP_M,
  EXPLODE_GROUND_CLEARANCE_M,
  FLOOR_COUNT,
  badgeExplodeOffset,
  explodeFloorIndex,
  explodeOffset,
  explodeProgress,
  floorWorldSpan,
  resetExplodeMotion,
  resetStationExplodeMotion,
  stepExplodeMotion,
  stepStationExplodeMotion,
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

  it('徽标偏移直接取 explodeOffset，动画没结束时不落位', () => {
    const specs = listFloorSpecs()
    specs.forEach((spec, index) => {
      expect(explodeFloorIndex(spec.id)).toBe(index)
      expect(badgeExplodeOffset(spec.id, 0)).toBe(0)
      expect(badgeExplodeOffset(spec.id, 1)).toBe(explodeOffset(index, 1))
      expect(badgeExplodeOffset(spec.id, 0.4)).toBe(explodeOffset(index, 0.4))
    })
    const collapsed = { id: 'F12', y: 52.5 }
    expect(collapsed.y + badgeExplodeOffset(collapsed.id, 0)).toBe(collapsed.y)
    expect(collapsed.y + badgeExplodeOffset('F12', 1)).toBe(52.5 + explodeOffset(12, 1))
    expect(badgeExplodeOffset('B1', 1)).toBe(explodeOffset(0, 1))
    expect(badgeExplodeOffset('F22', 1) - badgeExplodeOffset('B1', 1)).toBe(22 * EXPLODE_GAP_M)

    resetExplodeMotion()
    const opened = stepExplodeMotion(true, 'building', 10)
    expect(opened.animating).toBe(true)
    expect(opened.progress).toBe(0)
    const again = stepExplodeMotion(true, 'building', 10)
    expect(again).toEqual(opened)
    const mid = stepExplodeMotion(true, 'building', 10 + EXPLODE_DURATION_S / 2)
    expect(mid.animating).toBe(true)
    expect(mid.progress).toBeGreaterThan(0)
    expect(mid.progress).toBeLessThan(1)
    const settled = stepExplodeMotion(true, 'building', 10 + EXPLODE_DURATION_S)
    expect(settled.animating).toBe(false)
    expect(settled.progress).toBe(1)
    expect(badgeExplodeOffset('F8', settled.progress)).toBe(explodeOffset(8, 1))

    const closing = stepExplodeMotion(false, 'building', 30)
    expect(closing.animating).toBe(true)
    const closed = stepExplodeMotion(false, 'building', 30 + EXPLODE_DURATION_S)
    expect(closed).toEqual({ progress: 0, animating: false })
    expect(badgeExplodeOffset('F18', closed.progress)).toBe(0)
    resetExplodeMotion()
  })
})

describe('爆炸进度目标', () => {
  afterEach(() => {
    delete (globalThis as { __ea?: number }).__ea
    delete (globalThis as { __es?: boolean }).__es
    resetExplodeMotion()
    resetStationExplodeMotion()
  })

  it('没写目标时布尔开关仍走到 1，写了 0.5 就停在一半', () => {
    resetExplodeMotion()
    const opened = stepExplodeMotion(true, 'building', 2)
    expect(opened).toEqual({ progress: 0, animating: true })
    const full = stepExplodeMotion(true, 'building', 2 + EXPLODE_DURATION_S)
    expect(full).toEqual({ progress: 1, animating: false })

    resetExplodeMotion()
    ;(globalThis as { __ea?: number }).__ea = 0.5
    const start = stepExplodeMotion(true, 'building', 4)
    expect(start).toEqual({ progress: 0, animating: true })
    const mid = stepExplodeMotion(true, 'building', 4 + EXPLODE_DURATION_S / 2)
    expect(mid.progress).toBeGreaterThan(0.25)
    expect(mid.progress).toBeLessThan(0.5)
    const held = stepExplodeMotion(true, 'building', 4 + EXPLODE_DURATION_S)
    expect(held).toEqual({ progress: 0.5, animating: false })
    const stayed = stepExplodeMotion(true, 'building', 4 + EXPLODE_DURATION_S + 1)
    expect(stayed).toEqual({ progress: 0.5, animating: false })
  })

  it('滑杆直接落到目标，键盘档仍补间；两套时钟互不覆盖', () => {
    resetExplodeMotion()
    resetStationExplodeMotion()
    const host = globalThis as { __ea?: number; __es?: boolean }
    host.__ea = 0.4
    host.__es = true
    expect(stepExplodeMotion(true, 'building', 8)).toEqual({ progress: 0.4, animating: false })
    expect(stepStationExplodeMotion(true, 'floor', 8)).toEqual({ progress: 0.4, animating: false })

    host.__es = false
    host.__ea = 1
    const floor = stepExplodeMotion(true, 'building', 9)
    expect(floor.animating).toBe(true)
    expect(floor.progress).toBe(0.4)
    const station = stepStationExplodeMotion(true, 'floor', 9)
    expect(station.progress).toBe(0.4)
    expect(station.animating).toBe(true)

    const floorDone = stepExplodeMotion(true, 'building', 9 + EXPLODE_DURATION_S)
    expect(floorDone).toEqual({ progress: 1, animating: false })
    const stationLeft = stepStationExplodeMotion(true, 'building', 9.1)
    expect(stationLeft).toEqual({ progress: 0, animating: false })
    const floorStill = stepExplodeMotion(true, 'building', 9 + EXPLODE_DURATION_S + 0.2)
    expect(floorStill.progress).toBe(1)
  })
})
