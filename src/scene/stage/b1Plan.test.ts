import { describe, expect, it } from 'vitest'
import { B1_COLOR_BLOCK_COUNT, b1ZoneRings } from '../b1Zones'
import { courtyardHole } from '../massing'
import { pageToWorld } from '../scale'
import {
  B1_ANCHOR_PAGE,
  B1_ANCHOR_SITE,
  B1_ATRIUM,
  B1_CANTEEN,
  B1_CEILING,
  B1_CORE,
  B1_EAST_PAGE,
  B1_EAST_SITE,
  B1_KITCHEN,
  B1_LOBBY,
  B1_PLAZA,
  B1_PLAZA_LABEL_PAGE,
  B1_ROOMS,
  b1PageToWorld,
  b1SlabOutline,
  basementPickOutline,
  pointInB1Slab,
  pointInRing,
  ringCentroid,
  ringFromAabb,
} from './b1Plan'
import {
  elevatorDoorBoxes,
  kitchenBoxes,
  privateRoomBoxes,
  stageBoxes,
  towerCoreBoxes,
  type BoxSpec,
} from './geometry'
import {
  B1_PLAZA as plazaFromLayout,
  COLUMN_EDGE_CLEAR_M,
  FAN,
  b1Columns,
  b1CoreOffset,
  canteenChairs,
  canteenTables,
  columnEdgeDistance,
  deskHitsColumn,
  fanOutline,
  fanSeatSlots,
  inFan,
  layoutWorkstations,
} from './layout'
import { WORKSTATIONS_PER_FLOOR, workstationPosition } from './workstationPosition'

function corners(box: { x0: number; x1: number; z0: number; z1: number }): Array<[number, number]> {
  return [
    [box.x0, box.z0],
    [box.x1, box.z0],
    [box.x1, box.z1],
    [box.x0, box.z1],
  ]
}

function boxCorners(spec: BoxSpec, offsetX = 0, offsetZ = 0): Array<[number, number]> {
  return [
    [offsetX + spec.x - spec.w / 2, offsetZ + spec.z - spec.d / 2],
    [offsetX + spec.x + spec.w / 2, offsetZ + spec.z - spec.d / 2],
    [offsetX + spec.x + spec.w / 2, offsetZ + spec.z + spec.d / 2],
    [offsetX + spec.x - spec.w / 2, offsetZ + spec.z + spec.d / 2],
  ]
}

describe('B1 配准与楼板', () => {
  it('126.8 m 边两端残差是 0 和 0.012 m', () => {
    const west = b1PageToWorld(B1_ANCHOR_PAGE.x, B1_ANCHOR_PAGE.y)
    const westSite = pageToWorld(B1_ANCHOR_SITE.x, B1_ANCHOR_SITE.y)
    expect(Math.hypot(west[0] - westSite[0], west[1] - westSite[1])).toBeCloseTo(0, 6)
    const east = b1PageToWorld(B1_EAST_PAGE.x, B1_EAST_PAGE.y)
    const eastSite = pageToWorld(B1_EAST_SITE.x, B1_EAST_SITE.y)
    expect(Math.hypot(east[0] - eastSite[0], east[1] - eastSite[1])).toBeCloseTo(0.012, 3)
  })

  it('楼板是一条外墙围合，室内物体的平面包围盒都在里面', () => {
    const slab = b1SlabOutline()
    expect(slab.length).toBeGreaterThan(8)
    const samples: Array<[number, number]> = []
    for (const box of [B1_KITCHEN, B1_CANTEEN, B1_PLAZA, B1_LOBBY, B1_CORE, B1_CEILING, ...B1_ROOMS]) {
      samples.push(...corners(box))
    }
    for (let i = 0; i < 24; i += 1) {
      const t = (i / 24) * Math.PI * 2
      samples.push([B1_ATRIUM.cx + Math.cos(t) * B1_ATRIUM.rx, B1_ATRIUM.cz + Math.sin(t) * B1_ATRIUM.rz])
    }
    samples.push(...fanOutline())
    for (const seat of fanSeatSlots()) samples.push([seat.x, seat.z])
    for (const table of canteenTables()) {
      samples.push([table.x - 1.05, table.z - 1.05], [table.x + 1.05, table.z + 1.05])
    }
    for (const chair of canteenChairs(canteenTables())) {
      samples.push([chair.x - 0.25, chair.z - 0.25], [chair.x + 0.25, chair.z + 0.25])
    }
    for (const column of b1Columns()) samples.push([column.x - 0.31, column.z - 0.31], [column.x + 0.31, column.z + 0.31])
    for (const spec of [...kitchenBoxes(), ...stageBoxes(), ...privateRoomBoxes(B1_ROOMS).glass, ...privateRoomBoxes(B1_ROOMS).wood]) {
      samples.push(...boxCorners(spec))
    }
    const core = b1CoreOffset()
    for (const spec of [...towerCoreBoxes(), ...elevatorDoorBoxes()]) {
      samples.push(...boxCorners(spec, core.x, core.z))
    }
    for (let index = 1; index <= WORKSTATIONS_PER_FLOOR; index += 1) {
      const desk = workstationPosition('B1', `B1-${index}`)
      samples.push(
        [desk.x - 0.7, desk.z - 0.35],
        [desk.x + 0.7, desk.z - 0.35],
        [desk.x - 0.7, desk.z + 0.92],
        [desk.x + 0.7, desk.z + 0.92],
      )
    }
    const outside = samples.filter(([x, z]) => !pointInB1Slab(x, z))
    expect(outside).toEqual([])
  })
})

describe('B1 工位与色块', () => {
  it('100 个工位躲开柱、食堂、礼堂和厨房', () => {
    const slots = layoutWorkstations('B1', WORKSTATIONS_PER_FLOOR)
    expect(slots).toHaveLength(100)
    const columns = b1Columns()
    expect(columns.length).toBeGreaterThan(8)
    let nearestEdge = Infinity
    for (const slot of slots) {
      expect(pointInRing(slot.x, slot.z, ringFromAabb(B1_KITCHEN))).toBe(false)
      expect(pointInRing(slot.x, slot.z, ringFromAabb(B1_CANTEEN))).toBe(false)
      expect(pointInRing(slot.x, slot.z, ringFromAabb(B1_PLAZA))).toBe(false)
      expect(inFan(slot.x, slot.z, 0.3)).toBe(false)
      for (const column of columns) {
        nearestEdge = Math.min(nearestEdge, columnEdgeDistance(slot.x, slot.z, column))
        expect(columnEdgeDistance(slot.x, slot.z, column)).toBeGreaterThanOrEqual(COLUMN_EDGE_CLEAR_M - 1e-6)
        expect(deskHitsColumn(slot, column)).toBe(false)
      }
    }
    expect(nearestEdge).toBeGreaterThanOrEqual(COLUMN_EDGE_CLEAR_M - 1e-6)
    expect(FAN.radius).toBeGreaterThan(10)
  })

  it('色块与室内房间同一轮廓，B1Pick 仍贴场地广场', () => {
    const zones = b1ZoneRings()
    expect(zones).toHaveLength(B1_COLOR_BLOCK_COUNT)
    expect(zones[0]).toEqual(ringFromAabb(B1_PLAZA))
    expect(zones[1]).toEqual(ringFromAabb(B1_LOBBY))
    expect(zones[2]).toEqual(fanOutline())
    expect(zones[4]).toEqual(ringFromAabb(B1_CANTEEN))
    expect(zones.slice(5)).toEqual(B1_ROOMS.map((room) => ringFromAabb(room)))
    expect(plazaFromLayout).toBe(B1_PLAZA)
    expect(basementPickOutline()).toEqual(courtyardHole())
    const label = b1PageToWorld(B1_PLAZA_LABEL_PAGE.x, B1_PLAZA_LABEL_PAGE.y)
    const site = ringCentroid(courtyardHole())
    const deviation = Math.hypot(label[0] - site.x, label[1] - site.z)
    expect(deviation).toBeGreaterThan(11)
    expect(deviation).toBeLessThan(13)
    expect(pointInB1Slab(label[0], label[1])).toBe(true)
  })
})
