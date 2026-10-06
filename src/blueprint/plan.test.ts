import { describe, expect, it } from 'vitest'
import { floorDeskCount } from '../floors/deskCounts'
import { hydrateAllAboveGrade } from '../floors/hydrateForTests'
import { createMockData, DESKS_PER_FLOOR } from '../data/mockData'
import { b1SlabBounds, b1SlabOutline } from '../scene/stage/b1Plan'
import { B1_CORE } from '../scene/stage/layout'
import { STATUS_COLOR, STATUS_HEX, STATUS_SHAPE } from '../scene/stage/status'
import { workstationPosition } from '../scene/stage/workstationPosition'
import { COLUMN_SIZE_M, floorPlanGeometry, planDesks } from './plan'

hydrateAllAboveGrade()

describe('蓝图平面', () => {
  it('F12 画出墙、房间和图纸工位，落点来自 workstationPosition', () => {
    const data = createMockData()
    const plan = floorPlanGeometry('F12')
    const desks = planDesks('F12', data.desks, data.devices)
    expect(plan.rooms.some((room) => room.name.includes('会议') || room.name.includes('茶水'))).toBe(true)
    expect(plan.walls.length).toBeGreaterThan(8)
    expect(plan.columns.length).toBeGreaterThan(8)
    expect(desks).toHaveLength(floorDeskCount('F12'))
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

  it('B1 楼板、核心筒、柱和工位与三维 B1 同一套坐标', () => {
    const data = createMockData()
    const plan = floorPlanGeometry('B1')
    expect(plan.slab).toEqual(b1SlabOutline())
    expect(plan.outline).toEqual(b1SlabBounds())
    expect(floorPlanGeometry('F12').slab).not.toBeNull()
    expect(floorPlanGeometry('F12').slab!.length).toBeGreaterThan(8)
    const onSlab = (x: number, z: number) =>
      x >= plan.outline.x0 && x <= plan.outline.x1 && z >= plan.outline.z0 && z <= plan.outline.z1
    const desks = planDesks('B1', data.desks, data.devices)
    expect(desks).toHaveLength(DESKS_PER_FLOOR)
    expect(desks.every((desk) => onSlab(desk.x, desk.z))).toBe(true)
    expect(plan.columns.every((column) => onSlab(column.x, column.z))).toBe(true)
    const inCore = plan.walls.filter(
      (wall) => wall.x >= B1_CORE.x0 && wall.x <= B1_CORE.x1 && wall.z >= B1_CORE.z0 && wall.z <= B1_CORE.z1,
    )
    expect(inCore.length).toBeGreaterThan(2)
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
