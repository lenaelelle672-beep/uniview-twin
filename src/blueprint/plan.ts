import { getFloorPlan } from '../floors/cache'
import type { FloorPlan } from '../floors/types'
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

  const plan = getFloorPlan(floorId)
  if (plan) return geometryFromJson(plan)

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

function ringAabb(ring: Array<[number, number]>): { x0: number; x1: number; z0: number; z1: number } {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [x, z] of ring) {
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    z0 = Math.min(z0, z)
    z1 = Math.max(z1, z)
  }
  return { x0, x1, z0, z1 }
}

function geometryFromJson(plan: FloorPlan): FloorPlanGeometry {
  const outline = ringAabb(plan.outline)
  const rooms: PlanRoom[] = []
  for (const item of plan.rooms) {
    if (!item.polygon || item.polygon.length < 3) continue
    const box = ringAabb(item.polygon)
    rooms.push({ name: item.name, ...box })
  }
  const walls: PlanRect[] = []
  for (const wall of plan.walls) {
    const dx = wall.b[0] - wall.a[0]
    const dz = wall.b[1] - wall.a[1]
    const length = Math.hypot(dx, dz)
    if (length < 0.2) continue
    walls.push({
      x: (wall.a[0] + wall.b[0]) / 2,
      z: (wall.a[1] + wall.b[1]) / 2,
      w: Math.abs(dx) < Math.abs(dz) ? 0.16 : length,
      d: Math.abs(dz) < Math.abs(dx) ? 0.16 : length,
    })
  }
  return {
    floorId: plan.floorId,
    bounds: boundsOf(outline),
    outline,
    slab: plan.outline,
    rooms: rooms.slice(0, 80),
    walls: walls.slice(0, 800),
    columns: plan.columns.map((column) => ({ x: column.x, z: column.z })),
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
