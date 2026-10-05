import { describe, expect, it } from 'vitest'
import { getFloorPlan } from './cache'
import { floorDeskCount, FLOOR_DESK_COUNTS } from './deskCounts'
import { hydrateAllAboveGrade, hydrateFloorFromDisk } from './hydrateForTests'
import { pointInRing } from './parsePlan'
import { isRoomName, roomLabelFilterStats, roomLabelsFromPlan } from './labels'

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

  it('房间标签只挂房间名，有稳定唯一 id，不过滤条数', () => {
    const plan = getFloorPlan('F12')!
    const stats = roomLabelFilterStats(plan)
    const labels = roomLabelsFromPlan(plan)
    expect(labels.length).toBe(stats.after)
    expect(stats.shown).toBe(stats.after)
    const text = labels.map((label) => label.text).join(' ')
    expect(text).toMatch(/会议|茶水|电梯/)
    expect(text).not.toMatch(/尾气|强电|送风|排风|门洞|常开/)
    const ids = labels.map((label) => label.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const label of labels) {
      expect(label.id).toMatch(/^F12:/)
      expect(label.label[1]).toBeGreaterThan(label.anchor[1])
    }
  })

  it('officeDesks 数量跟 JSON 一致', () => {
    expect(getFloorPlan('F18')!.officeDesks).toHaveLength(2)
    expect(getFloorPlan('F21')!.officeDesks).toHaveLength(6)
    expect(getFloorPlan('F22')!.officeDesks).toHaveLength(12)
    expect(getFloorPlan('F12')!.officeDesks).toHaveLength(0)
  })

  it('过滤非房间标注，并给出每层过滤前后数量', () => {
    expect(isRoomName('尾气')).toBe(false)
    expect(isRoomName('强电')).toBe(false)
    expect(isRoomName('送风')).toBe(false)
    expect(isRoomName('排风')).toBe(false)
    expect(isRoomName('女')).toBe(false)
    expect(isRoomName('P')).toBe(false)
    expect(isRoomName('（常开）')).toBe(false)
    expect(isRoomName('门洞尺寸：206')).toBe(false)
    expect(isRoomName('洽谈室')).toBe(true)
    expect(isRoomName('丙类储藏')).toBe(true)
    for (let level = 1; level <= 22; level += 1) {
      const stats = roomLabelFilterStats(getFloorPlan(`F${level}`)!)
      expect(stats.after).toBeLessThan(stats.before)
      expect(stats.shown).toBe(stats.after)
      expect(stats.dropped.length).toBeGreaterThan(0)
    }
  })

  it('工位都在外轮廓里', () => {
    hydrateFloorFromDisk('F12')
    const plan = getFloorPlan('F12')!
    expect(plan.desks.every((desk) => pointInRing(desk.x, desk.z, plan.outline))).toBe(true)
  })
})
