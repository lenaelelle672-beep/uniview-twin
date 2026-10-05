import { describe, expect, it } from 'vitest'
import { getFloorPlan } from './cache'
import { floorDeskCount, FLOOR_DESK_COUNTS } from './deskCounts'
import { hydrateAllAboveGrade, hydrateFloorFromDisk } from './hydrateForTests'
import { pointInRing } from './parsePlan'
import { roomLabelsFromPlan, MAX_ROOM_LABELS } from './labels'

hydrateAllAboveGrade()

describe('楼层图纸', () => {
  it('22 层都能读到，工位数和 walkPaths 跟文件一致', () => {
    for (let level = 1; level <= 22; level += 1) {
      const floorId = `F${level}`
      const plan = getFloorPlan(floorId)
      expect(plan).toBeDefined()
      expect(plan!.desks).toHaveLength(floorDeskCount(floorId))
      expect(plan!.desks.every((desk, index) => desk.id === `${floorId}-${index + 1}` && desk.n === index + 1)).toBe(true)
      expect(plan!.columns.length).toBeGreaterThan(0)
      expect(plan!.cores.length).toBeGreaterThan(0)
      expect(plan!.outline.length).toBeGreaterThan(3)
      if (plan!.walkPaths.length > 0) {
        expect(plan!.walkPaths.length).toBeLessThanOrEqual(12)
        for (const path of plan!.walkPaths) {
          const first = path[0]
          const last = path[path.length - 1]
          expect(first[0]).toBeCloseTo(last[0], 5)
          expect(first[1]).toBeCloseTo(last[1], 5)
        }
      }
    }
    expect(FLOOR_DESK_COUNTS.F12).toBe(184)
    expect(FLOOR_DESK_COUNTS.F7).toBe(315)
  })

  it('9F/10F/11F/22F 套 13F 的工位坐标，只改编号', () => {
    const source = getFloorPlan('F13')!
    for (const floorId of ['F9', 'F10', 'F11', 'F22']) {
      const plan = getFloorPlan(floorId)!
      expect(plan.desks).toHaveLength(source.desks.length)
      expect(plan.desks.map((desk) => [desk.x, desk.z])).toEqual(source.desks.map((desk) => [desk.x, desk.z]))
      expect(plan.desks[0].id).toBe(`${floorId}-1`)
    }
  })

  it('房间标签放在 JSON 的 label 点上，不超过 24 个', () => {
    const plan = getFloorPlan('F12')!
    const labels = roomLabelsFromPlan(plan)
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.length).toBeLessThanOrEqual(MAX_ROOM_LABELS)
    const text = labels.map((label) => label.text).join(' ')
    expect(text).toMatch(/会议|茶水|电梯/)
    for (const label of labels) {
      expect(label.label[1]).toBeGreaterThan(label.anchor[1])
    }
  })

  it('工位都在外轮廓里', () => {
    hydrateFloorFromDisk('F12')
    const plan = getFloorPlan('F12')!
    expect(plan.desks.every((desk) => pointInRing(desk.x, desk.z, plan.outline))).toBe(true)
  })
})
