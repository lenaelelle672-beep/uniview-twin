import { beforeEach, describe, expect, it } from 'vitest'
import { floorIdList } from '../../data/floors'
import { DESKS_PER_FLOOR, createMockData } from '../../data/mockData'
import { resetTwinStore, useTwinStore } from '../../store/store'
import { TOWER } from '../siteGeometry'
import {
  activeFloorId,
  cutElevation,
  hiddenFloorIds,
  isFloorCurtainOpen,
  isFloorShellHidden,
  isRoofHidden,
  SLAB_M,
} from './cut'
import {
  B1_ROOMS,
  CORE,
  FAN,
  KITCHEN,
  MEETINGS,
  PANTRY,
  RECEPTION,
  canteenTables,
  fanSeatSlots,
  inFan,
  layoutWorkstations,
  towerColumns,
} from './layout'
import { floorCameraPose } from './poses'
import { pcStatusOf } from './status'

function inside(x: number, z: number, box: { x0: number; x1: number; z0: number; z1: number }, pad = 0) {
  return x > box.x0 - pad && x < box.x1 + pad && z > box.z0 - pad && z < box.z1 + pad
}

describe('单层剖切', () => {
  it('F12 隐藏 F13 及以上，B1 隐藏全部地上层', () => {
    expect(hiddenFloorIds('floor', 'F12')).toEqual(floorIdList().filter((id) => id !== 'B1' && Number(id.slice(1)) >= 13))
    expect(hiddenFloorIds('floor', 'B1')).toEqual(floorIdList().filter((id) => id !== 'B1'))
    expect(hiddenFloorIds('floor', 'F22')).toEqual([])
    expect(hiddenFloorIds('building', 'F12')).toEqual([])
    expect(activeFloorId('blueprint', 'F12')).toBeNull()
  })

  it('切面在选中层楼板顶面，本层幕墙打开，屋面隐藏', () => {
    expect(cutElevation('floor', 'F12')).toBeCloseTo(48 + SLAB_M, 5)
    expect(cutElevation('floor', 'B1')).toBeCloseTo(-5.5 + SLAB_M, 5)
    expect(cutElevation('building', 'F12')).toBeNull()
    expect(isFloorShellHidden('floor', 'F12', 52.2)).toBe(true)
    expect(isFloorShellHidden('floor', 'F12', 48)).toBe(false)
    expect(isFloorCurtainOpen('floor', 'F12', 'F12')).toBe(true)
    expect(isFloorCurtainOpen('floor', 'F12', 'F11')).toBe(false)
    expect(isRoofHidden('floor', 'F3')).toBe(true)
    expect(isRoofHidden('building', 'F3')).toBe(false)
  })
})

describe('工位布置', () => {
  it('标准层和 B1 的工位数量与数据条数一致，并避开房间', () => {
    for (const floorId of ['F1', 'F12', 'F22', 'B1']) {
      const slots = layoutWorkstations(floorId, DESKS_PER_FLOOR)
      expect(slots).toHaveLength(DESKS_PER_FLOOR)
      const nearest = minSpacing(slots)
      expect(nearest).toBeGreaterThan(1.45)
      for (const slot of slots) {
        if (floorId === 'B1') {
          expect(inside(slot.x, slot.z, CORE, 0.4)).toBe(false)
          expect(inside(slot.x, slot.z, KITCHEN, 0.3)).toBe(false)
          expect(inFan(slot.x, slot.z, 0.3)).toBe(false)
        } else {
          expect(slot.x).toBeGreaterThan(TOWER.minX + 0.8)
          expect(slot.x).toBeLessThan(TOWER.maxX - 0.8)
          expect(slot.z).toBeGreaterThan(TOWER.minZ + 0.8)
          expect(slot.z).toBeLessThan(TOWER.maxZ - 0.8)
          expect(inside(slot.x, slot.z, CORE, 0.4)).toBe(false)
          expect(inside(slot.x, slot.z, RECEPTION, 0.3)).toBe(false)
          expect(inside(slot.x, slot.z, PANTRY, 0.3)).toBe(false)
          for (const room of MEETINGS) expect(inside(slot.x, slot.z, room, 0.3)).toBe(false)
        }
      }
    }
  })

  it('少量工位也能排下，不会多生成', () => {
    expect(layoutWorkstations('F2', 0)).toEqual([])
    expect(layoutWorkstations('F2', 2)).toHaveLength(2)
    expect(layoutWorkstations('B1', 1)).toHaveLength(1)
  })

  it('B1 有 5 个包厢、食堂圆桌和扇形座席', () => {
    expect(B1_ROOMS).toHaveLength(5)
    expect(canteenTables().length).toBeGreaterThanOrEqual(12)
    const seats = fanSeatSlots()
    expect(seats.length).toBeGreaterThan(40)
    expect(seats.every((seat) => inFan(seat.x, seat.z, 0.2))).toBe(true)
    expect(towerColumns().length).toBeGreaterThan(8)
    const radii = [0, 1, 2, 3].map((row) => {
      const seat = seats[rowStart(row)]
      return Math.hypot(seat.x - FAN.apexX, seat.z - FAN.apexZ)
    })
    expect(radii[1]).toBeGreaterThan(radii[0])
    expect(radii[3]).toBeGreaterThan(radii[2])
  })
})

describe('设备状态上色', () => {
  it('显示器颜色跟该工位电脑状态走', () => {
    const data = createMockData()
    const desks = data.desks.filter((desk) => desk.floorId === 'F12')
    expect(desks).toHaveLength(DESKS_PER_FLOOR)
    const statuses = new Set(desks.map((desk) => pcStatusOf(data.devices, desk.id)))
    expect(statuses.has('online')).toBe(true)
    expect(statuses.has('idle')).toBe(true)
    expect(statuses.has('alarm')).toBe(true)
    expect(statuses.has('offline')).toBe(true)
    const orphan = pcStatusOf(data.devices, 'F12-missing')
    expect(orphan).toBe('offline')
  })
})

describe('enterFloor / exitFloor', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('进入楼层切到单层，返回总览时保留选中层', () => {
    useTwinStore.getState().enterFloor('F12')
    expect(useTwinStore.getState().view).toBe('floor')
    expect(useTwinStore.getState().selectedFloor).toBe('F12')
    useTwinStore.getState().enterFloor('F12')
    expect(useTwinStore.getState().view).toBe('floor')
    useTwinStore.getState().exitFloor()
    expect(useTwinStore.getState().view).toBe('building')
    expect(useTwinStore.getState().selectedFloor).toBe('F12')
    useTwinStore.getState().exitFloor()
    expect(useTwinStore.getState().view).toBe('building')
  })

  it('忽略非法楼层号', () => {
    useTwinStore.getState().enterFloor('F99')
    expect(useTwinStore.getState().view).toBe('building')
    expect(useTwinStore.getState().selectedFloor).toBeNull()
  })

  it('F12 机位压到该层附近，B1 机位看向地下室', () => {
    const f12 = floorCameraPose('F12')
    expect(f12.position[1]).toBeGreaterThan(48)
    expect(f12.position[1]).toBeLessThan(64)
    expect(f12.target[1]).toBeGreaterThan(48)
    expect(f12.target[1]).toBeLessThan(50)
    const distance = Math.hypot(f12.position[0] - f12.target[0], f12.position[2] - f12.target[2])
    expect(distance).toBeLessThan(40)
    const b1 = floorCameraPose('B1')
    expect(b1.target[1]).toBeLessThan(-4)
    expect(b1.position[1]).toBeLessThan(64)
    expect(b1.position[1]).toBeGreaterThan(8)
  })
})

function minSpacing(slots: Array<{ x: number; z: number }>): number {
  let nearest = Infinity
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      nearest = Math.min(nearest, Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z))
    }
  }
  return nearest
}

function rowStart(row: number): number {
  let index = 0
  for (let current = 0; current < row; current += 1) index += 6 + current * 2
  return index
}
