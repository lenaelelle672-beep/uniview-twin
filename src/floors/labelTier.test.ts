import { describe, expect, it } from 'vitest'
import { getFloorPlan } from './cache'
import { hydrateAllAboveGrade } from './hydrateForTests'
import {
  LABEL_TIER2_AREA,
  classifyRoomLabel,
  isDepartmentName,
  namedAreaM2,
  roomAreaM2,
} from './labelTier'
import { TIER2_REF_COUNTS, roomNamesFromPlan, tier2RoomsFromPlan } from './labels'

hydrateAllAboveGrade()

describe('D247 / D248 标签分级', () => {
  it('关键字、部门口径和面积顺序写成可测纯函数', () => {
    expect(LABEL_TIER2_AREA).toBe(40)
    expect(classifyRoomLabel('国内市场部（61+1+100+3=165人）').rule).toBe('department')
    expect(classifyRoomLabel('IT部（96+1人）').tier).toBe(2)
    expect(isDepartmentName('采购部（88+1人）')).toBe(true)
    expect(isDepartmentName('公共事务部展厅')).toBe(true)
    expect(isDepartmentName('丙类公共事务部礼品房')).toBe(true)
    expect(isDepartmentName('1350-研发')).toBe(true)
    expect(isDepartmentName('备用办公区')).toBe(true)
    expect(isDepartmentName('研发车间')).toBe(true)
    expect(isDepartmentName('硬件部实验室')).toBe(true)
    expect(classifyRoomLabel('会议室A1').rule).toBe('meeting')
    expect(classifyRoomLabel('贵宾会议室').rule).toBe('meeting')
    expect(classifyRoomLabel('会议接待').rule).toBe('meeting')
    expect(classifyRoomLabel('会议桌').rule).toBe('meeting')
    expect(classifyRoomLabel('技服培训室(120㎡）').rule).toBe('training')
    expect(classifyRoomLabel('培训室/大会议室').rule).toBe('meeting')
    expect(classifyRoomLabel('展厅').rule).toBe('hall')
    expect(classifyRoomLabel('贵宾接待室').rule).toBe('reception')
    expect(classifyRoomLabel('前台').rule).toBe('front')
    expect(classifyRoomLabel('面试前台').rule).toBe('front')
    expect(classifyRoomLabel('大厅/中庭').rule).toBe('lobby')
    expect(classifyRoomLabel('生产大厅').rule).toBe('lobby')
    expect(classifyRoomLabel('食堂').rule).toBe('canteen')
    expect(classifyRoomLabel('装备车间', 104.6).rule).toBe('area')
    expect(classifyRoomLabel('59㎡12人').tier).toBe(3)
    expect(classifyRoomLabel('一体机选型').tier).toBe(3)
    expect(classifyRoomLabel('男卫').tier).toBe(3)
    expect(classifyRoomLabel('1#楼梯').tier).toBe(3)
    expect(classifyRoomLabel('外廊').tier).toBe(3)
    expect(classifyRoomLabel('打印').tier).toBe(3)
  })

  it('面积按 多边形 → labelArea_m2 → 名字㎡', () => {
    expect(namedAreaM2('技服培训室(120㎡）')).toBe(120)
    expect(roomAreaM2('硬件实验室', 0, 470)).toBe(470)
    expect(roomAreaM2('光学实验室', 0, 320)).toBe(320)
    expect(roomAreaM2('实验车间', 73.5, 65)).toBe(73.5)
    expect(roomAreaM2('收发室', 0, 60)).toBe(60)
    expect(roomAreaM2('技服培训室(120㎡）', 0, null)).toBe(120)
    expect(classifyRoomLabel('硬件实验室', 0, 470)).toEqual({ tier: 2, rule: 'area', area: 470 })
    expect(classifyRoomLabel('收发室', 0, 60).rule).toBe('area')
    expect(classifyRoomLabel('茶水', 96).tier).toBe(2)
    expect(classifyRoomLabel('茶水', 96).rule).toBe('area')
  })

  it('F1–F8 第二级数与参考清单一致', () => {
    for (const [floorId, count] of Object.entries(TIER2_REF_COUNTS)) {
      const plan = getFloorPlan(floorId)!
      const rows = tier2RoomsFromPlan(plan)
      expect(rows.length, `${floorId} ${rows.map((row) => row.name).join(',')}`).toBe(count)
      const kept = new Set(roomNamesFromPlan(plan).map((room) => room.id))
      for (const row of rows) {
        const roomId = row.id.slice(floorId.length + 1)
        expect(kept.has(roomId), row.id).toBe(true)
        expect(row.rule).not.toBe('minor')
      }
    }
  })
})
