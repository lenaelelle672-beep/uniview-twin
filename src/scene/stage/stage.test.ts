import { beforeEach, describe, expect, it } from 'vitest'
import { Box3, type BufferGeometry } from 'three'
import { floorDeskCount } from '../../floors/deskCounts'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { floorIdList, floorSpec } from '../../data/floors'
import { DESKS_PER_FLOOR, createMockData } from '../../data/mockData'
import { resetTwinStore, useTwinStore } from '../../store/store'
import { TOWER } from '../siteGeometry'
import {
  activeFloorId,
  cutElevation,
  hiddenFloorIds,
  isBasementSlabHidden,
  isBasementZonesHidden,
  isFloorCurtainOpen,
  isFloorShellHidden,
  isRoofHidden,
  SLAB_M,
} from './cut'
import { columnGeometry, deskGeometry } from './geometry'
import {
  B1_CORE,
  B1_ROOMS,
  COLUMN_EDGE_CLEAR_M,
  FAN,
  KITCHEN,
  b1Columns,
  canteenTables,
  columnEdgeDistance,
  deskHitsColumn,
  fanSeatSlots,
  inFan,
  layoutWorkstations,
  towerColumns,
} from './layout'
import { obliqueOverviewSeed } from './poses'
import { pcStatusOf } from './status'
import { WORKSTATIONS_PER_FLOOR, workstationPosition, workstationsOnFloor } from './workstationPosition'

hydrateAllAboveGrade()

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
    expect(cutElevation('floor', 'F12')).toBeCloseTo(floorSpec('F12').elevation + SLAB_M, 5)
    expect(cutElevation('floor', 'B1')).toBeCloseTo(-5.5 + SLAB_M, 5)
    expect(cutElevation('building', 'F12')).toBeNull()
    expect(isFloorShellHidden('floor', 'F12', floorSpec('F13').elevation)).toBe(true)
    expect(isFloorShellHidden('floor', 'F12', floorSpec('F12').elevation)).toBe(false)
    expect(isFloorCurtainOpen('floor', 'F12', 'F12')).toBe(true)
    expect(isFloorCurtainOpen('floor', 'F12', 'F11')).toBe(false)
    expect(isRoofHidden('floor', 'F3')).toBe(true)
    expect(isRoofHidden('building', 'F3')).toBe(false)
  })

  it('地上单层隐藏 B1 楼板和色块，总览和 B1 不隐藏', () => {
    const samples: Array<[Parameters<typeof isBasementSlabHidden>[0], string | null]> = [
      ['building', null],
      ['building', 'F12'],
      ['blueprint', 'F12'],
      ['floor', 'B1'],
      ['floor', null],
    ]
    for (const [view, floor] of samples) {
      expect(isBasementSlabHidden(view, floor)).toBe(false)
      expect(isBasementZonesHidden(view, floor)).toBe(false)
    }
    for (let level = 1; level <= 22; level += 1) {
      expect(isBasementSlabHidden('floor', `F${level}`)).toBe(true)
      expect(isBasementZonesHidden('floor', `F${level}`)).toBe(isBasementSlabHidden('floor', `F${level}`))
    }
  })
})

describe('工位布置', () => {
  it('B1 仍按楼板公式排 100 个；地上层工位数跟图纸一致', () => {
    const basement = layoutWorkstations('B1', DESKS_PER_FLOOR)
    expect(basement).toHaveLength(DESKS_PER_FLOOR)
    expect(minSpacing(basement)).toBeGreaterThan(1.45)
    for (const slot of basement) {
      expect(inside(slot.x, slot.z, B1_CORE, 0.4)).toBe(false)
      expect(inside(slot.x, slot.z, KITCHEN, 0.3)).toBe(false)
      expect(inFan(slot.x, slot.z, 0.3)).toBe(false)
    }
    expect(workstationsOnFloor('F12')).toBe(184)
    expect(workstationsOnFloor('F1')).toBe(floorDeskCount('F1'))
    const tower = workstationPosition('F12', 'F12-1')
    expect(tower.x).toBeGreaterThan(TOWER.minX)
    expect(tower.x).toBeLessThan(TOWER.maxX)
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
    expect(desks).toHaveLength(floorDeskCount('F12'))
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

  it('单层俯视种子在楼板斜上方', () => {
    const seed = obliqueOverviewSeed({ x: 0, y: 48.16, z: 0 }, { x: 66.3, z: 26.3 })
    expect(seed.target).toEqual([0, 48.16, 0])
    expect(seed.position[1]).toBeGreaterThan(seed.target[1] + 8)
    const horizontal = Math.hypot(seed.position[0] - seed.target[0], seed.position[2] - seed.target[2])
    const rise = seed.position[1] - seed.target[1]
    expect(horizontal).toBeGreaterThan(rise)
    expect(rise / horizontal).toBeGreaterThan(0.4)
    expect(Math.abs(seed.position[2])).toBeGreaterThan(Math.abs(seed.position[0]))
  })
})

describe('工位避柱', () => {
  it('B1 桌心到柱边至少 1.10 m；地上层照图保留，违规见 deskRule 清单', () => {
    const desk = geometryBounds(deskGeometry)
    const column = geometryBounds(columnGeometry)
    const deskHalfX = (desk.max.x - desk.min.x) / 2
    const deskHalfZ = (desk.max.z - desk.min.z) / 2
    const columnHalfX = (column.max.x - column.min.x) / 2
    const columnHalfZ = (column.max.z - column.min.z) / 2
    expect(deskHalfX + columnHalfX).toBeCloseTo(1.01, 5)
    expect(COLUMN_EDGE_CLEAR_M).toBe(1.1)

    const columns = b1Columns()
    for (let index = 1; index <= WORKSTATIONS_PER_FLOOR; index += 1) {
      const place = workstationPosition('B1', `B1-${index}`)
      const slot = { x: place.x, z: place.z, rot: 0 }
      for (const columnPoint of columns) {
        const dx = Math.abs(place.x - columnPoint.x)
        const dz = Math.abs(place.z - columnPoint.z)
        const overlaps = dx < deskHalfX + columnHalfX - 1e-6 && dz < deskHalfZ + columnHalfZ - 1e-6
        expect(overlaps).toBe(false)
        expect(deskHitsColumn(slot, columnPoint)).toBe(false)
        expect(columnEdgeDistance(place.x, place.z, columnPoint)).toBeGreaterThanOrEqual(COLUMN_EDGE_CLEAR_M - 1e-9)
      }
    }
    expect(workstationsOnFloor('F12')).toBe(184)
  })
})

function geometryBounds(geometry: BufferGeometry): Box3 {
  geometry.computeBoundingBox()
  if (!geometry.boundingBox) throw new Error('几何没有包围盒')
  return geometry.boundingBox
}

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
