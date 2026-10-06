import type { Desk, Device, DeviceStatus } from '../types'
import {
  B1_ATRIUM,
  B1_CORE,
  B1_ROOMS,
  CORE,
  KITCHEN,
  MEETINGS,
  PANTRY,
  RECEPTION,
  b1Columns,
  b1CoreOffset,
  fanOutline,
  towerColumns,
  type Aabb,
} from '../scene/stage/layout'
import { b1SlabBounds, b1SlabOutline } from '../scene/stage/b1Plan'
import {
  COLUMN_SIZE_M,
  kitchenBoxes,
  meetingGlassBoxes,
  privateRoomBoxes,
  towerCoreBoxes,
  type BoxSpec,
} from '../scene/stage/geometry'
import { pcStatusOf } from '../scene/stage/status'
import { TOWER } from '../scene/siteGeometry'
import { workstationPosition } from '../scene/stage/workstationPosition'

export interface PlanBounds {
  minX: number
  minZ: number
  width: number
  depth: number
}

export interface PlanRect {
  x: number
  z: number
  w: number
  d: number
}

export interface PlanRoom {
  name: string
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface PlanPoint {
  x: number
  z: number
}

export interface FloorPlanGeometry {
  floorId: string
  bounds: PlanBounds
  outline: { x0: number; x1: number; z0: number; z1: number }
  /** 楼板折线。B1 与三维 B1Slab 同为 b1SlabOutline()；塔楼为 null，按 outline 画矩形。 */
  slab: Array<[number, number]> | null
  rooms: PlanRoom[]
  walls: PlanRect[]
  columns: PlanPoint[]
  atrium: { cx: number; cz: number; rx: number; rz: number } | null
  fan: Array<[number, number]> | null
}

export interface PlanDesk {
  id: string
  x: number
  z: number
  status: DeviceStatus
}

const PAD_M = 2

function room(name: string, box: Aabb): PlanRoom {
  return { name, x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1 }
}

function isPlanWall(box: BoxSpec): boolean {
  if (box.h < 2) return false
  const thinX = box.w <= 0.4
  const thinZ = box.d <= 0.4
  return thinX !== thinZ
}

function wallRects(boxes: BoxSpec[]): PlanRect[] {
  return boxes.filter(isPlanWall).map((box) => ({ x: box.x, z: box.z, w: box.w, d: box.d }))
}

function shift(boxes: BoxSpec[], dx: number, dz: number): BoxSpec[] {
  return boxes.map((box) => ({ ...box, x: box.x + dx, z: box.z + dz }))
}

function boundsOf(outline: FloorPlanGeometry['outline']): PlanBounds {
  return {
    minX: outline.x0 - PAD_M,
    minZ: outline.z0 - PAD_M,
    width: outline.x1 - outline.x0 + PAD_M * 2,
    depth: outline.z1 - outline.z0 + PAD_M * 2,
  }
}

/** 当前楼层的墙、房间和柱。坐标来自 T004 的 layout / geometry，不另写一套平面。 */
export function floorPlanGeometry(floorId: string): FloorPlanGeometry {
  if (floorId === 'B1') {
    const outline = b1SlabBounds()
    const core = b1CoreOffset()
    const rooms = [
      room('核心筒', B1_CORE),
      room('厨房', KITCHEN),
      ...B1_ROOMS.map((box, index) => room(`包厢 ${index + 1}`, box)),
    ]
    const walls = wallRects([
      ...shift(towerCoreBoxes(), core.x, core.z),
      ...privateRoomBoxes(B1_ROOMS).glass,
      ...kitchenBoxes(),
    ])
    return {
      floorId,
      bounds: boundsOf(outline),
      outline,
      slab: b1SlabOutline(),
      rooms,
      walls,
      columns: b1Columns(),
      atrium: { cx: B1_ATRIUM.cx, cz: B1_ATRIUM.cz, rx: B1_ATRIUM.rx, rz: B1_ATRIUM.rz },
      fan: fanOutline(),
    }
  }

  const outline = { x0: TOWER.minX, x1: TOWER.maxX, z0: TOWER.minZ, z1: TOWER.maxZ }
  const rooms = [
    room('核心筒', CORE),
    ...MEETINGS.map((box, index) => room(`会议室 ${index + 1}`, box)),
    room('前台', RECEPTION),
    room('茶水间', PANTRY),
  ]
  return {
    floorId,
    bounds: boundsOf(outline),
    outline,
    slab: null,
    rooms,
    walls: wallRects([...towerCoreBoxes(), ...meetingGlassBoxes()]),
    columns: towerColumns(),
    atrium: null,
    fan: null,
  }
}

/** 工位落点只走 workstationPosition。状态跟该工位电脑，和三维显示器同一套。 */
export function planDesks(floorId: string, desks: Desk[], devices: Device[]): PlanDesk[] {
  return desks
    .filter((desk) => desk.floorId === floorId)
    .sort((desk, other) => desk.index - other.index)
    .map((desk) => {
      const position = workstationPosition(floorId, desk.id)
      return { id: desk.id, x: position.x, z: position.z, status: pcStatusOf(devices, desk.id) }
    })
}

export { COLUMN_SIZE_M }
