import { TOWER } from '../siteGeometry'
import {
  B1_ATRIUM,
  B1_CANTEEN,
  B1_CEILING,
  B1_CORE,
  B1_FAN_APEX_PAGE,
  B1_KITCHEN,
  B1_LOBBY,
  B1_PLAZA,
  B1_ROOMS,
  b1ColumnPoints,
  b1PageToPoint,
  b1SlabBounds,
  pointInB1Slab,
} from './b1Plan'

export interface Aabb {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface Slot {
  x: number
  z: number
  rot: number
}

export interface Point {
  x: number
  z: number
}

/** 塔楼标准层核心筒：电梯厅居中，两侧楼梯，北侧卫生间。 */
export const CORE: Aabb = { x0: -6.3, x1: 6.3, z0: -4.5, z1: 5.4 }

/** 三间玻璃会议室，靠北侧，相机从南边俯视时落在核心筒后方。 */
export const MEETINGS: Aabb[] = [
  { x0: -20.6, x1: -11.2, z0: -12.5, z1: -7.15 },
  { x0: -9.6, x1: -0.2, z0: -12.5, z1: -7.15 },
  { x0: 1.2, x1: 10.8, z0: -12.5, z1: -7.15 },
]

export const RECEPTION: Aabb = { x0: -7.6, x1: 3.2, z0: 7.7, z1: 12.15 }

export const PANTRY: Aabb = { x0: 8.1, x1: 15.8, z0: 1.15, z1: 7.55 }

const fanAnchor = b1PageToPoint(B1_FAN_APEX_PAGE.x, B1_FAN_APEX_PAGE.y)

export const FAN = {
  apexX: fanAnchor.x,
  apexZ: fanAnchor.z,
  a0: Math.PI * 0.08,
  a1: Math.PI * 0.92,
  radius: 12.4,
}

export const KITCHEN: Aabb = B1_KITCHEN

export { B1_ATRIUM, B1_CEILING, B1_CORE, B1_LOBBY, B1_PLAZA, B1_ROOMS }

/** 核心筒几何按塔楼局部坐标生成，再平移到 B1 电梯厅。 */
export function b1CoreOffset(): Point {
  return { x: B1_CORE.x0 - CORE.x0, z: B1_CORE.z0 - CORE.z0 }
}

export function canteenPadCenter(): Point {
  return { x: (B1_CANTEEN.x0 + B1_CANTEEN.x1) / 2, z: (B1_CANTEEN.z0 + B1_CANTEEN.z1) / 2 }
}

export function canteenFloorSize(): { w: number; d: number } {
  return { w: B1_CANTEEN.x1 - B1_CANTEEN.x0, d: B1_CANTEEN.z1 - B1_CANTEEN.z0 }
}

const TOWER_DESK_ZONES: Aabb[] = [
  { x0: -31.4, x1: -7.5, z0: -6.15, z1: 6.7 },
  { x0: 7.4, x1: 31.5, z0: -6.15, z1: 0.35 },
  { x0: 16.6, x1: 31.5, z0: 0.7, z1: 6.9 },
  { x0: -31.4, x1: -8.4, z0: 7.15, z1: 12.05 },
  { x0: 4.2, x1: 31.5, z0: 8.05, z1: 12.05 },
  { x0: 12.2, x1: 31.5, z0: -12.15, z1: -7.45 },
]

/** 柱断面 0.62 m。D034：桌心到柱边不少于 1.10 m。 */
export const COLUMN_HALF_M = 0.31
export const DESK_HALF_X_M = 0.7
export const DESK_HALF_Z_M = 0.35
export const COLUMN_EDGE_CLEAR_M = 1.1

function insideAabb(x: number, z: number, box: Aabb, pad = 0): boolean {
  return x >= box.x0 - pad && x <= box.x1 + pad && z >= box.z0 - pad && z <= box.z1 + pad
}

function inTowerPlate(x: number, z: number): boolean {
  return x >= TOWER.minX + 1.05 && x <= TOWER.maxX - 1.05 && z >= TOWER.minZ + 1.05 && z <= TOWER.maxZ - 1.05
}

function deskInsideSlab(slot: Slot): boolean {
  const xs = [slot.x - DESK_HALF_X_M, slot.x + DESK_HALF_X_M]
  const zs = [slot.z - DESK_HALF_Z_M, slot.z + 0.92]
  return xs.every((x) => zs.every((z) => pointInB1Slab(x, z)))
}

function inAtrium(x: number, z: number, pad = 0.4): boolean {
  const dx = (x - B1_ATRIUM.cx) / (B1_ATRIUM.rx + pad)
  const dz = (z - B1_ATRIUM.cz) / (B1_ATRIUM.rz + pad)
  return dx * dx + dz * dz <= 1
}

export function inFan(x: number, z: number, pad = 0.7): boolean {
  const dx = x - FAN.apexX
  const dz = z - FAN.apexZ
  const radius = Math.hypot(dx, dz)
  if (radius > FAN.radius + pad) return false
  const angle = Math.atan2(dz, dx)
  return angle >= FAN.a0 - 0.08 && angle <= FAN.a1 + 0.08
}

export function towerColumns(): Point[] {
  const columns: Point[] = []
  const xs = [-25.2, -16.8, -8.4, 0, 8.4, 16.8, 25.2]
  const zs = [-9.4, 0, 8.6]
  for (const x of xs) {
    for (const z of zs) {
      if (!inTowerPlate(x, z)) continue
      if (insideAabb(x, z, CORE, 0.45)) continue
      if (MEETINGS.some((room) => insideAabb(x, z, room, 0.3))) continue
      if (insideAabb(x, z, RECEPTION, 0.3)) continue
      if (insideAabb(x, z, PANTRY, 0.3)) continue
      columns.push({ x, z })
    }
  }
  return columns
}

export function columnEdgeDistance(x: number, z: number, column: Point): number {
  const dx = Math.abs(x - column.x) - COLUMN_HALF_M
  const dz = Math.abs(z - column.z) - COLUMN_HALF_M
  if (dx < 0 && dz < 0) return 0
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
}

export function deskHitsColumn(slot: Slot, column: Point): boolean {
  return (
    Math.abs(slot.x - column.x) < DESK_HALF_X_M + COLUMN_HALF_M &&
    Math.abs(slot.z - column.z) < DESK_HALF_Z_M + COLUMN_HALF_M
  )
}

export function b1Columns(): Point[] {
  const columns: Point[] = []
  for (const column of b1ColumnPoints()) {
    const half = COLUMN_HALF_M
    const footprintInside =
      pointInB1Slab(column.x - half, column.z - half) &&
      pointInB1Slab(column.x + half, column.z - half) &&
      pointInB1Slab(column.x + half, column.z + half) &&
      pointInB1Slab(column.x - half, column.z + half)
    if (!footprintInside) continue
    if (insideAabb(column.x, column.z, B1_CORE, 0.3)) continue
    if (insideAabb(column.x, column.z, KITCHEN, 0.3)) continue
    if (insideAabb(column.x, column.z, B1_LOBBY, 0.3)) continue
    if (insideAabb(column.x, column.z, B1_PLAZA, 0.3)) continue
    if (insideAabb(column.x, column.z, B1_CANTEEN, 0.3)) continue
    if (B1_ROOMS.some((room) => insideAabb(column.x, column.z, room, 0.3))) continue
    if (inAtrium(column.x, column.z, 0.6)) continue
    if (inFan(column.x, column.z, 0.8)) continue
    columns.push(column)
  }
  return columns
}

function slotsInZone(zone: Aabb, gapX: number, gapZ: number): Slot[] {
  const width = zone.x1 - zone.x0
  const depth = zone.z1 - zone.z0
  if (width < gapX * 0.85 || depth < gapZ * 0.85) return []
  const cols = Math.max(1, Math.floor(width / gapX))
  const rows = Math.max(1, Math.floor(depth / gapZ))
  const originX = (zone.x0 + zone.x1) / 2 - ((cols - 1) * gapX) / 2
  const originZ = (zone.z0 + zone.z1) / 2 - ((rows - 1) * gapZ) / 2
  const slots: Slot[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      slots.push({ x: originX + col * gapX, z: originZ + row * gapZ, rot: 0 })
    }
  }
  return slots
}

function towerBlocked(slot: Slot, pad: number): boolean {
  if (!inTowerPlate(slot.x, slot.z)) return true
  if (insideAabb(slot.x, slot.z, CORE, pad)) return true
  if (MEETINGS.some((room) => insideAabb(slot.x, slot.z, room, pad))) return true
  if (insideAabb(slot.x, slot.z, RECEPTION, pad)) return true
  if (insideAabb(slot.x, slot.z, PANTRY, pad)) return true
  return towerColumns().some((column) => Math.hypot(column.x - slot.x, column.z - slot.z) < 0.95)
}

function b1Blocked(slot: Slot, pad: number): boolean {
  if (!deskInsideSlab(slot)) return true
  if (insideAabb(slot.x, slot.z, B1_CORE, pad)) return true
  if (insideAabb(slot.x, slot.z, KITCHEN, pad)) return true
  if (insideAabb(slot.x, slot.z, B1_LOBBY, pad)) return true
  if (insideAabb(slot.x, slot.z, B1_PLAZA, pad)) return true
  if (insideAabb(slot.x, slot.z, B1_CANTEEN, pad + 0.9)) return true
  if (B1_ROOMS.some((room) => insideAabb(slot.x, slot.z, room, pad))) return true
  if (inAtrium(slot.x, slot.z, pad)) return true
  if (inFan(slot.x, slot.z, pad)) return true
  return b1Columns().some(
    (column) => columnEdgeDistance(slot.x, slot.z, column) < COLUMN_EDGE_CLEAR_M || deskHitsColumn(slot, column),
  )
}

function b1DeskSlots(gapX: number, gapZ: number): Slot[] {
  const bounds = b1SlabBounds()
  const slots: Slot[] = []
  const x0 = bounds.x0 + DESK_HALF_X_M + 0.4
  const x1 = bounds.x1 - DESK_HALF_X_M - 0.4
  const z0 = bounds.z0 + 0.5
  const z1 = bounds.z1 - 1.05
  for (let z = z0; z <= z1; z += gapZ) {
    for (let x = x0; x <= x1; x += gapX) {
      slots.push({ x, z, rot: 0 })
    }
  }
  return slots
}

function collect(floorId: string, gapX: number, gapZ: number, pad: number): Slot[] {
  const blocked = floorId === 'B1' ? b1Blocked : towerBlocked
  const slots: Slot[] = []
  const candidates = floorId === 'B1' ? b1DeskSlots(gapX, gapZ) : TOWER_DESK_ZONES.flatMap((zone) => slotsInZone(zone, gapX, gapZ))
  for (const slot of candidates) {
    if (!blocked(slot, pad)) slots.push(slot)
  }
  return slots
}

/**
 * 内部排布，按当前楼板轮廓把序号铺进可放置区域。
 * 对外落点只通过 workstationPosition 读取；不要在别处再算一套坐标。
 * 轮廓来自 siteGeometry。轮廓变了以后要仍能在新楼板内排满每层 100 个。
 */
export function layoutWorkstations(floorId: string, count: number): Slot[] {
  if (count <= 0) return []
  const gapX0 = floorId === 'B1' ? 2.15 : 2.02
  const gapZ0 = floorId === 'B1' ? 2.45 : 2.2
  for (let step = 0; step < 8; step += 1) {
    const scale = 1 - step * 0.07
    const slots = collect(floorId, gapX0 * scale, gapZ0 * scale, 0.72)
    if (slots.length >= count) return slots.slice(0, count)
  }
  const fallback = collect(floorId, gapX0 * 0.5, gapZ0 * 0.5, 0.4)
  if (fallback.length < count) {
    throw new Error(`工位排不下：${floorId} 需要 ${count}，只有 ${fallback.length}`)
  }
  return fallback.slice(0, count)
}

export function canteenTables(): Point[] {
  const inset = 2.15
  const zone: Aabb = {
    x0: B1_CANTEEN.x0 + inset,
    x1: B1_CANTEEN.x1 - inset,
    z0: B1_CANTEEN.z0 + inset,
    z1: B1_CANTEEN.z1 - inset,
  }
  return slotsInZone(zone, 3.2, 3.6).map((slot) => ({ x: slot.x, z: slot.z }))
}

export function canteenChairs(tables: Point[]): Slot[] {
  const chairs: Slot[] = []
  for (const table of tables) {
    for (let index = 0; index < 4; index += 1) {
      const angle = (index * Math.PI) / 2
      chairs.push({
        x: table.x + Math.sin(angle) * 1.62,
        z: table.z + Math.cos(angle) * 1.62,
        rot: angle,
      })
    }
  }
  return chairs
}

export function fanSeatSlots(): Slot[] {
  const seats: Slot[] = []
  for (let row = 0; row < 7; row += 1) {
    const radius = 3.5 + row * 1.42
    const count = 6 + row * 2
    for (let index = 0; index < count; index += 1) {
      const span = FAN.a1 - FAN.a0 - 0.22
      const angle = FAN.a0 + 0.11 + (span * index) / (count - 1)
      const x = FAN.apexX + Math.cos(angle) * radius
      const z = FAN.apexZ + Math.sin(angle) * radius
      seats.push({ x, z, rot: Math.atan2(x - FAN.apexX, z - FAN.apexZ) })
    }
  }
  return seats
}

export function fanOutline(): Array<[number, number]> {
  const points: Array<[number, number]> = [[FAN.apexX, FAN.apexZ]]
  const steps = 22
  for (let index = 0; index <= steps; index += 1) {
    const angle = FAN.a0 + ((FAN.a1 - FAN.a0) * index) / steps
    points.push([FAN.apexX + Math.cos(angle) * FAN.radius, FAN.apexZ + Math.sin(angle) * FAN.radius])
  }
  return points
}

export function aabbCenter(box: Aabb): Point {
  return { x: (box.x0 + box.x1) / 2, z: (box.z0 + box.z1) / 2 }
}
