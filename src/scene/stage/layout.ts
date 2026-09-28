import { FOOTPRINT, TOWER } from '../siteGeometry'

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

/**
 * D025 之前裙楼西北角贴着塔楼西北角（-33.5, -13.5）。
 * 原点改到测量坐标后，裙楼楼板南移。负一层室内按当前 FOOTPRINT 平移，相对关系不变。
 */
const BASEMENT_ANCHOR = { x: -33.5, z: -13.5 }

export const B1_SHIFT = {
  x: FOOTPRINT.minX - BASEMENT_ANCHOR.x,
  z: FOOTPRINT.minZ - BASEMENT_ANCHOR.z,
}

function onBasementSlab(x: number, z: number): Point {
  return { x: x + B1_SHIFT.x, z: z + B1_SHIFT.z }
}

function onBasementBox(box: Aabb): Aabb {
  const min = onBasementSlab(box.x0, box.z0)
  const max = onBasementSlab(box.x1, box.z1)
  return { x0: min.x, x1: max.x, z0: min.z, z1: max.z }
}

const fanAnchor = onBasementSlab(33, 15.2)

export const FAN = {
  apexX: fanAnchor.x,
  apexZ: fanAnchor.z,
  a0: Math.PI * 0.08,
  a1: Math.PI * 0.92,
  radius: 12.4,
}

export const KITCHEN: Aabb = onBasementBox({ x0: -30.4, x1: -14.2, z0: -12.2, z1: -2.1 })

export const B1_CORE: Aabb = onBasementBox(CORE)

export const B1_ROOMS: Aabb[] = [0, 1, 2, 3, 4].map((index) => {
  const z0 = 2.4 + index * 5.45
  return onBasementBox({ x0: -32.5, x1: -27.7, z0, z1: z0 + 4.15 })
})

/** 图纸中庭，铺在裙楼楼板上。场地里的下沉庭院已挪到西南广场，不在这块楼板上。 */
const atriumAnchor = onBasementSlab(0, 24)
export const B1_ATRIUM = { cx: atriumAnchor.x, cz: atriumAnchor.z, rx: 15, rz: 8.2 }

export function canteenPadCenter(): Point {
  return onBasementSlab(-21, 13)
}

const TOWER_DESK_ZONES: Aabb[] = [
  { x0: -31.4, x1: -7.5, z0: -6.15, z1: 6.7 },
  { x0: 7.4, x1: 31.5, z0: -6.15, z1: 0.35 },
  { x0: 16.6, x1: 31.5, z0: 0.7, z1: 6.9 },
  { x0: -31.4, x1: -8.4, z0: 7.15, z1: 12.05 },
  { x0: 4.2, x1: 31.5, z0: 8.05, z1: 12.05 },
  { x0: 12.2, x1: 31.5, z0: -12.15, z1: -7.45 },
]

const B1_DESK_ZONES: Aabb[] = [
  { x0: 47.5, x1: 62.2, z0: 1.5, z1: 31.5 },
  { x0: 18.5, x1: 45.5, z0: -11.2, z1: 6.2 },
  { x0: 46.8, x1: 62.2, z0: -11.2, z1: 0.6 },
].map(onBasementBox)

function insideAabb(x: number, z: number, box: Aabb, pad = 0): boolean {
  return x >= box.x0 - pad && x <= box.x1 + pad && z >= box.z0 - pad && z <= box.z1 + pad
}

function inTowerPlate(x: number, z: number): boolean {
  return x >= TOWER.minX + 1.05 && x <= TOWER.maxX - 1.05 && z >= TOWER.minZ + 1.05 && z <= TOWER.maxZ - 1.05
}

function inFootprint(x: number, z: number): boolean {
  return x >= FOOTPRINT.minX + 1.3 && x <= FOOTPRINT.maxX - 1.3 && z >= FOOTPRINT.minZ + 1.3 && z <= FOOTPRINT.maxZ - 1.3
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

/** 柱断面 0.62 m。D034：桌心到柱边不少于 1.10 m。 */
export const COLUMN_HALF_M = 0.31
export const DESK_HALF_X_M = 0.7
export const DESK_HALF_Z_M = 0.35
export const COLUMN_EDGE_CLEAR_M = 1.1

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
  for (let x = -24; x <= 56; x += 8) {
    for (let z = -8; z <= 28; z += 8) {
      const column = onBasementSlab(x, z)
      if (!inFootprint(column.x, column.z)) continue
      if (insideAabb(column.x, column.z, B1_CORE, 0.5)) continue
      if (insideAabb(column.x, column.z, KITCHEN, 0.4)) continue
      if (B1_ROOMS.some((room) => insideAabb(column.x, column.z, room, 0.4))) continue
      if (inAtrium(column.x, column.z, 0.8)) continue
      if (inFan(column.x, column.z, 1)) continue
      columns.push(column)
    }
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
  return towerColumns().some(
    (column) => columnEdgeDistance(slot.x, slot.z, column) < COLUMN_EDGE_CLEAR_M || deskHitsColumn(slot, column),
  )
}

function b1Blocked(slot: Slot, pad: number): boolean {
  if (!inFootprint(slot.x, slot.z)) return true
  if (insideAabb(slot.x, slot.z, B1_CORE, pad)) return true
  if (insideAabb(slot.x, slot.z, KITCHEN, pad)) return true
  if (B1_ROOMS.some((room) => insideAabb(slot.x, slot.z, room, pad))) return true
  if (inAtrium(slot.x, slot.z, pad)) return true
  if (inFan(slot.x, slot.z, pad)) return true
  return b1Columns().some((column) => Math.hypot(column.x - slot.x, column.z - slot.z) < 1.1)
}

function collect(floorId: string, gapX: number, gapZ: number, pad: number): Slot[] {
  const zones = floorId === 'B1' ? B1_DESK_ZONES : TOWER_DESK_ZONES
  const blocked = floorId === 'B1' ? b1Blocked : towerBlocked
  const slots: Slot[] = []
  for (const zone of zones) {
    for (const slot of slotsInZone(zone, gapX, gapZ)) {
      if (!blocked(slot, pad)) slots.push(slot)
    }
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
  const tables: Point[] = []
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      tables.push(onBasementSlab(-25.6 + col * 3.15, 6.8 + row * 4.15))
    }
  }
  return tables
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
