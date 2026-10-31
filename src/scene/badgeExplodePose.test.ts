import { describe, expect, it } from 'vitest'
import {
  badgeExplodeDelta,
  composeLabelPoint,
  floorBadgeLift,
  installBadgePoseHooks,
  syncFloorBadgeLifts,
} from './badgeExplodePose'
import {
  EXPLODE_DURATION_S,
  badgeExplodeOffset,
  readExplodeMotion,
  readStationExplodeMotion,
  resetExplodeMotion,
  resetStationExplodeMotion,
  stepExplodeMotion,
  stepStationExplodeMotion,
} from './explode'
import { levelFrame, stationDelta } from './stationExplode'

describe('徽标爆炸增量', () => {
  it('进度 0 时增量为 0，只读时钟不推进', () => {
    resetExplodeMotion()
    resetStationExplodeMotion()
    const frame = levelFrame([
      { x: 0, z: 0 },
      { x: 0, z: 2.2 },
    ])
    expect(badgeExplodeDelta('F8', 1, 2.2, false, frame)).toEqual({ x: 0, y: 0, z: 0 })
    expect(readExplodeMotion()).toEqual({ progress: 0, animating: false })
    expect(readStationExplodeMotion()).toEqual({ progress: 0, animating: false })
    expect(floorBadgeLift('F8', false)).toBe(0)
    expect(floorBadgeLift('F8', true)).toBe(0)
  })

  it('工位进度和楼层抬升叠在锚点上，挂在外壳上的标签不加竖直偏移', () => {
    resetExplodeMotion()
    resetStationExplodeMotion()
    stepExplodeMotion(true, 'building', 4)
    stepExplodeMotion(true, 'building', 4 + EXPLODE_DURATION_S)
    stepStationExplodeMotion(true, 'floor', 8)
    stepStationExplodeMotion(true, 'floor', 8 + EXPLODE_DURATION_S)
    const frame = levelFrame([
      { x: 1, z: 0 },
      { x: 1, z: 2.2 },
    ])
    const desk = stationDelta(frame, 1, 2.2)
    const badge = badgeExplodeDelta('F12', 4, 2.2, false, frame)
    expect(badge.z).toBeCloseTo(desk.z, 5)
    expect(badge.x).toBeCloseTo(desk.x, 5)
    expect(badge.y).toBeCloseTo(badgeExplodeOffset('F12', 1), 5)
    expect(readExplodeMotion().progress).toBe(1)
    expect(readStationExplodeMotion().progress).toBe(1)

    const rest: [number, number, number] = [4.35, 1.6, 2.05]
    const shifted = composeLabelPoint(rest, 4, 2.2, 'F12', true, frame)
    expect(shifted[0] - rest[0]).toBeCloseTo(stationDelta(frame, 4, 2.2).x, 5)
    expect(shifted[2] - rest[2]).toBeCloseTo(stationDelta(frame, 4, 2.2).z, 5)
    expect(shifted[1]).toBe(rest[1])
    const lifted = composeLabelPoint(rest, 4, 2.2, 'F12', false, frame)
    expect(lifted[1] - rest[1]).toBeCloseTo(badgeExplodeOffset('F12', 1), 5)
    resetExplodeMotion()
    resetStationExplodeMotion()
  })

  it('楼层徽标偏移写回探针，未知层号不动', () => {
    resetExplodeMotion()
    stepExplodeMotion(true, 'building', 2)
    stepExplodeMotion(true, 'building', 2 + EXPLODE_DURATION_S)
    const root = globalThis as { window?: Window }
    const previous = root.window
    root.window = {
      __twinExplode: {
        progress: 0,
        exploded: false,
        gap: 0,
        overlap: false,
        floors: [
          { id: 'B1', offset: 0, groupY: null, bottom: 0, top: 1 },
          { id: 'F1', offset: 0, groupY: null, bottom: 0, top: 1 },
          { id: 'nope', offset: 4, groupY: null, bottom: 0, top: 1 },
        ],
      },
    } as Window
    try {
      syncFloorBadgeLifts()
      const floors = root.window.__twinExplode?.floors ?? []
      expect(floors[0]?.offset).toBe(badgeExplodeOffset('B1', 1))
      expect(floors[1]?.offset).toBe(badgeExplodeOffset('F1', 1))
      expect(floors[2]?.offset).toBe(4)
      expect(readExplodeMotion().progress).toBe(1)
    } finally {
      if (previous) root.window = previous
      else delete root.window
      resetExplodeMotion()
    }
  })

  it('分包时钟停在 0 时，楼层徽标跟外壳公布的进度', () => {
    resetExplodeMotion()
    const root = globalThis as { window?: Window }
    const previous = root.window
    root.window = {
      __twinExplode: {
        progress: 1,
        exploded: true,
        gap: 8,
        overlap: false,
        floors: [
          { id: 'B1', offset: 0, groupY: null, bottom: 0, top: 1 },
          { id: 'F12', offset: 0, groupY: null, bottom: 0, top: 1 },
        ],
      },
    } as Window
    try {
      syncFloorBadgeLifts()
      const floors = root.window.__twinExplode?.floors ?? []
      expect(floors[0]?.offset).toBe(badgeExplodeOffset('B1', 1))
      expect(floors[1]?.offset).toBe(badgeExplodeOffset('F12', 1))
      expect(readExplodeMotion().progress).toBe(0)
      expect(floorBadgeLift('F12', false)).toBe(badgeExplodeOffset('F12', 1))
      expect(floorBadgeLift('F12', true)).toBe(0)
    } finally {
      if (previous) root.window = previous
      else delete root.window
      resetExplodeMotion()
    }
  })

  it('安装的钩子和直接读数一致', () => {
    resetStationExplodeMotion()
    resetExplodeMotion()
    stepStationExplodeMotion(true, 'floor', 1)
    stepStationExplodeMotion(true, 'floor', 1 + EXPLODE_DURATION_S / 2)
    const frame = levelFrame([
      { x: 0, z: 0 },
      { x: 0, z: 2.2 },
    ])
    const root = globalThis as { window?: Window }
    const previous = root.window
    root.window = {} as Window
    try {
      installBadgePoseHooks()
      root.window.__twinStationFrame = frame
      const hooked = root.window.__twinBadgeExplodeDelta?.('F4', 0, 2.2, false)
      const direct = badgeExplodeDelta('F4', 0, 2.2, false, frame)
      expect(hooked?.z).toBeCloseTo(direct.z, 5)
      expect(hooked?.y).toBeCloseTo(direct.y, 5)
      expect(readStationExplodeMotion().animating).toBe(true)
    } finally {
      if (previous) root.window = previous
      else delete root.window
      resetStationExplodeMotion()
      resetExplodeMotion()
    }
  })
})
