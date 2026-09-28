import { describe, expect, it } from 'vitest'
import { createMockData, DESKS_PER_FLOOR } from '../data/mockData'
import { STATUS_COLOR, STATUS_HEX, STATUS_SHAPE } from '../scene/stage/status'
import { workstationPosition } from '../scene/stage/workstationPosition'
import { COLUMN_SIZE_M, floorPlanGeometry, planDesks } from './plan'

describe('蓝图平面', () => {
  it('F12 画出墙、房间和 100 个工位，落点来自 workstationPosition', () => {
    const data = createMockData()
    const plan = floorPlanGeometry('F12')
    const desks = planDesks('F12', data.desks, data.devices)
    expect(plan.rooms.map((room) => room.name)).toEqual(['核心筒', '会议室 1', '会议室 2', '会议室 3', '前台', '茶水间'])
    expect(plan.walls.length).toBeGreaterThan(8)
    expect(plan.columns.length).toBeGreaterThan(8)
    expect(desks).toHaveLength(DESKS_PER_FLOOR)
    const source = data.desks.filter((desk) => desk.floorId === 'F12')
    expect(desks.every((desk) => desk.x === workstationPosition('F12', desk.id).x && desk.z === workstationPosition('F12', desk.id).z)).toBe(true)
    expect(desks.some((desk, index) => desk.x !== source[index].x || desk.z !== source[index].z)).toBe(true)
    expect(new Set(desks.map((desk) => desk.status))).toEqual(new Set(['online', 'idle', 'alarm', 'offline']))
  })

  it('B1 复用地下室房间、扇形和中庭', () => {
    const plan = floorPlanGeometry('B1')
    expect(plan.rooms.some((room) => room.name === '厨房')).toBe(true)
    expect(plan.rooms.filter((room) => room.name.startsWith('包厢'))).toHaveLength(5)
    expect(plan.fan && plan.fan.length).toBeGreaterThan(4)
    expect(plan.atrium).not.toBeNull()
    expect(plan.walls.length).toBeGreaterThan(4)
    expect(COLUMN_SIZE_M).toBeGreaterThan(0.4)
  })

  it('四种状态的颜色和形状与三维共用一套常量', () => {
    expect(STATUS_SHAPE).toEqual({
      online: 'circle',
      idle: 'square',
      alarm: 'triangle',
      offline: 'cross',
    })
    expect(STATUS_HEX).toEqual({
      online: '#2fbf71',
      idle: '#3d7dff',
      alarm: '#ff4d4f',
      offline: '#a8b0ba',
    })
    for (const status of ['online', 'idle', 'alarm', 'offline'] as const) {
      expect(STATUS_COLOR[status].getHexString()).toBe(STATUS_HEX[status].slice(1))
    }
  })
})
