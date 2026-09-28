import { BoxGeometry, BufferGeometry, CylinderGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Aabb } from './layout'
import { B1_ROOMS, CORE, FAN, KITCHEN, MEETINGS, PANTRY, RECEPTION, aabbCenter } from './layout'

export interface BoxSpec {
  x: number
  y: number
  z: number
  w: number
  h: number
  d: number
}

export function mergeBoxes(boxes: BoxSpec[]): BufferGeometry {
  if (boxes.length === 0) throw new Error('室内几何为空')
  const parts = boxes.map((box) => {
    const geometry = new BoxGeometry(box.w, box.h, box.d)
    geometry.translate(box.x, box.y, box.z)
    return geometry
  })
  const merged = mergeGeometries(parts)
  parts.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('室内几何为空')
  return merged
}

function box(x: number, y: number, z: number, w: number, h: number, d: number): BoxSpec {
  return { x, y, z, w, h, d }
}

const WALL_H = 2.55
const INNER_H = 1.15
const THICK = 0.16

export function towerCoreBoxes(): BoxSpec[] {
  const { x0, x1, z0, z1 } = CORE
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const width = x1 - x0
  const depth = z1 - z0
  const y = WALL_H / 2
  const boxes: BoxSpec[] = [
    box((x0 - 1.2) / 2, y, z1 - THICK / 2, -1.2 - x0, WALL_H, THICK),
    box((1.2 + x1) / 2, y, z1 - THICK / 2, x1 - 1.2, WALL_H, THICK),
    box(cx, y, z0 + THICK / 2, width, WALL_H, THICK),
    box(x0 + THICK / 2, y, cz, THICK, WALL_H, depth),
    box(x1 - THICK / 2, y, cz, THICK, WALL_H, depth),
  ]

  const shaftW = 1.52
  const shaftD = 1.7
  const gap = 0.16
  const bank = 4 * shaftW + 3 * gap
  for (let index = 0; index < 4; index += 1) {
    const sx = -bank / 2 + shaftW / 2 + index * (shaftW + gap)
    boxes.push(box(sx, 0.62, 0.55 + shaftD / 2, shaftW, INNER_H, 0.08))
    if (index < 3) {
      boxes.push(box(sx + (shaftW + gap) / 2, 0.62, 0.55, 0.08, INNER_H, shaftD))
    }
  }

  const stepH = 0.16
  const stepD = 0.4
  for (const side of [-1, 1]) {
    const sx = side * 4.85
    for (let step = 0; step < 8; step += 1) {
      const top = (step + 1) * stepH
      boxes.push(box(sx, top - 0.04, -1.7 + step * stepD, 2.05, 0.08, stepD - 0.04))
    }
  }

  const restY = INNER_H / 2
  boxes.push(box(-3.15, restY, -1.72, 5.7, INNER_H, 0.08))
  boxes.push(box(3.15, restY, -1.72, 5.7, INNER_H, 0.08))
  boxes.push(box(0, restY, -3.05, 0.08, INNER_H, 2.5))
  for (const side of [-1, 1]) {
    for (let stall = 0; stall < 3; stall += 1) {
      const sx = side * (2.1 + stall * 1.15)
      boxes.push(box(sx, restY, -3.35, 0.06, INNER_H, 1.15))
      boxes.push(box(sx - side * 0.45, 0.22, -4.05, 0.42, 0.38, 0.48))
    }
  }
  return boxes
}

export function elevatorDoorBoxes(): BoxSpec[] {
  const shaftW = 1.52
  const shaftD = 1.7
  const gap = 0.16
  const bank = 4 * shaftW + 3 * gap
  const boxes: BoxSpec[] = []
  for (let index = 0; index < 4; index += 1) {
    const sx = -bank / 2 + shaftW / 2 + index * (shaftW + gap)
    boxes.push(box(sx, 0.04, 0.55, shaftW - 0.1, 0.05, shaftD - 0.1))
    boxes.push(box(sx, 1.05, 0.55 - 0.82, 0.92, 2.0, 0.04))
  }
  return boxes
}

function roomFloor(room: Aabb, y = 0.03): BoxSpec {
  const center = aabbCenter(room)
  return box(center.x, y, center.z, room.x1 - room.x0 - 0.12, 0.045, room.z1 - room.z0 - 0.12)
}

export function towerWoodBoxes(): BoxSpec[] {
  const boxes: BoxSpec[] = []
  for (const room of MEETINGS) {
    const center = aabbCenter(room)
    boxes.push(roomFloor(room))
    boxes.push(box(center.x, 0.76, center.z + 0.35, (room.x1 - room.x0) * 0.62, 0.06, 1.05))
  }
  const reception = aabbCenter(RECEPTION)
  boxes.push(roomFloor(RECEPTION, 0.02))
  boxes.push(box(reception.x, 0.56, 9.35, 7.4, 1.08, 1.12))
  boxes.push(roomFloor(PANTRY, 0.02))
  boxes.push(box(11.9, 0.48, 1.85, 6.6, 0.92, 0.7))
  boxes.push(box(14.85, 1.05, 5.15, 1.4, 2.05, 0.72))
  boxes.push(box(10.6, 0.46, 4.7, 2.3, 0.88, 0.95))
  return boxes
}

export function meetingGlassBoxes(): BoxSpec[] {
  const height = 2.35
  const y = height / 2
  const t = 0.045
  const boxes: BoxSpec[] = []
  for (const room of MEETINGS) {
    const center = aabbCenter(room)
    const width = room.x1 - room.x0
    const depth = room.z1 - room.z0
    boxes.push(box(center.x, y, room.z0, width, height, t))
    boxes.push(box(room.x0, y, center.z, t, height, depth))
    boxes.push(box(room.x1, y, center.z, t, height, depth))
  }
  return boxes
}

export function meetingFrameBoxes(): BoxSpec[] {
  const height = 2.35
  const boxes: BoxSpec[] = []
  for (const room of MEETINGS) {
    for (const x of [room.x0, room.x1]) {
      for (const z of [room.z0, room.z1]) {
        boxes.push(box(x, height / 2, z, 0.08, height, 0.08))
      }
    }
  }
  return boxes
}

export function meetingChairBoxes(): BoxSpec[] {
  const boxes: BoxSpec[] = []
  for (const room of MEETINGS) {
    const center = aabbCenter(room)
    const seats: Array<[number, number, number]> = [
      [center.x - 0.7, center.z + 1.15, 0],
      [center.x + 0.7, center.z + 1.15, 0],
      [center.x - 0.7, center.z - 0.45, Math.PI],
      [center.x + 0.7, center.z - 0.45, Math.PI],
    ]
    for (const [x, z] of seats) {
      boxes.push(box(x, 0.46, z, 0.46, 0.07, 0.42))
      boxes.push(box(x, 0.78, z + (z > center.z ? 0.2 : -0.2), 0.46, 0.42, 0.06))
    }
  }
  return boxes
}

export function kitchenBoxes(): BoxSpec[] {
  const center = aabbCenter(KITCHEN)
  const width = KITCHEN.x1 - KITCHEN.x0
  const depth = KITCHEN.z1 - KITCHEN.z0
  return [
    roomFloor(KITCHEN, 0.02),
    box(center.x, 0.48, KITCHEN.z0 + 1.15, width - 1.4, 0.92, 0.8),
    box(center.x, 0.48, center.z, width - 2.6, 0.9, depth * 0.32),
    box(KITCHEN.x0 + 1.5, 1.15, KITCHEN.z0 + 1.5, 2.0, 2.2, 0.8),
    box(KITCHEN.x1 - 1.5, 1.35, KITCHEN.z1 - 1.4, 1.6, 1.1, 1.4),
  ]
}

export function privateRoomBoxes(rooms: Aabb[]): { glass: BoxSpec[]; wood: BoxSpec[]; chairs: BoxSpec[] } {
  const glass: BoxSpec[] = []
  const wood: BoxSpec[] = []
  const chairs: BoxSpec[] = []
  const height = 2.4
  for (const room of rooms) {
    const center = aabbCenter(room)
    const width = room.x1 - room.x0
    const depth = room.z1 - room.z0
    const y = height / 2
    const t = 0.05
    wood.push(roomFloor(room))
    wood.push(box(center.x, 0.76, center.z, width * 0.62, 0.06, 1.15))
    glass.push(box(center.x, y, room.z0, width, height, t))
    glass.push(box(center.x, y, room.z1, width, height, t))
    glass.push(box(room.x0, y, center.z, t, height, depth))
    const door = 1.05
    const leaf = (depth - door) / 2
    glass.push(box(room.x1, y, room.z0 + leaf / 2, t, height, leaf))
    glass.push(box(room.x1, y, room.z1 - leaf / 2, t, height, leaf))
    for (const [dx, dz] of [
      [-0.55, 0.85],
      [0.55, 0.85],
      [-0.55, -0.85],
      [0.55, -0.85],
    ] as const) {
      chairs.push(box(center.x + dx, 0.46, center.z + dz, 0.42, 0.07, 0.4))
    }
  }
  return { glass, wood, chairs }
}

export function createDeskGeometry(): BufferGeometry {
  return mergeBoxes([
    box(0, 0.745, 0, 1.4, 0.045, 0.7),
    box(-0.62, 0.36, -0.28, 0.06, 0.72, 0.06),
    box(0.62, 0.36, -0.28, 0.06, 0.72, 0.06),
    box(-0.62, 0.36, 0.28, 0.06, 0.72, 0.06),
    box(0.62, 0.36, 0.28, 0.06, 0.72, 0.06),
  ])
}

export function createMonitorGeometry(): BufferGeometry {
  const screen = new BoxGeometry(0.52, 0.32, 0.028)
  screen.rotateX(-0.42)
  screen.translate(0, 1.02, -0.22)
  const neck = new BoxGeometry(0.05, 0.16, 0.05)
  neck.translate(0, 0.86, -0.2)
  const plate = new BoxGeometry(0.72, 0.028, 0.46)
  plate.translate(0, 0.79, 0.02)
  const merged = mergeGeometries([screen, neck, plate])
  screen.dispose()
  neck.dispose()
  plate.dispose()
  if (!merged) throw new Error('显示器几何为空')
  return merged
}

export function createDeskChairGeometry(): BufferGeometry {
  return mergeBoxes([
    box(0, 0.46, 0.62, 0.48, 0.07, 0.46),
    box(0, 0.78, 0.84, 0.48, 0.46, 0.06),
  ])
}

export function createDiningChairGeometry(): BufferGeometry {
  return mergeBoxes([
    box(0, 0.46, 0, 0.46, 0.07, 0.46),
    box(0, 0.76, 0.22, 0.46, 0.42, 0.06),
  ])
}

export function createRoundTableGeometry(): BufferGeometry {
  const top = new CylinderGeometry(1.05, 1.05, 0.07, 18)
  top.translate(0, 0.76, 0)
  const base = new CylinderGeometry(0.1, 0.16, 0.72, 10)
  base.translate(0, 0.36, 0)
  const merged = mergeGeometries([top, base])
  top.dispose()
  base.dispose()
  if (!merged) throw new Error('餐桌几何为空')
  return merged
}

export function createSeatGeometry(): BufferGeometry {
  return mergeBoxes([
    box(0, 0.42, 0, 0.58, 0.08, 0.48),
    box(0, 0.68, 0.2, 0.58, 0.36, 0.06),
  ])
}

export function createColumnGeometry(height: number): BufferGeometry {
  const geometry = new BoxGeometry(0.62, height, 0.62)
  geometry.translate(0, height / 2, 0)
  return geometry
}

const privateRooms = privateRoomBoxes(B1_ROOMS)

export const deskGeometry = createDeskGeometry()
export const monitorGeometry = createMonitorGeometry()
export const deskChairGeometry = createDeskChairGeometry()
export const diningChairGeometry = createDiningChairGeometry()
export const roundTableGeometry = createRoundTableGeometry()
export const seatGeometry = createSeatGeometry()
export const columnGeometry = createColumnGeometry(3.05)
export const towerCoreGeometry = mergeBoxes(towerCoreBoxes())
export const elevatorGeometry = mergeBoxes(elevatorDoorBoxes())
export const coreFloorGeometry = mergeBoxes([box(0, 0.025, 0.45, 12.15, 0.04, 9.45)])
export const towerWoodGeometry = mergeBoxes(towerWoodBoxes())
export const receptionBackGeometry = mergeBoxes([box(-2.2, 1.2, 11.45, 9.2, 2.25, 0.14)])
export const meetingGlassGeometry = mergeBoxes(meetingGlassBoxes())
export const meetingFrameGeometry = mergeBoxes(meetingFrameBoxes())
export const meetingChairGeometry = mergeBoxes(meetingChairBoxes())
export const kitchenGeometry = mergeBoxes(kitchenBoxes())
export const privateGlassGeometry = mergeBoxes(privateRooms.glass)
export const privateWoodGeometry = mergeBoxes(privateRooms.wood)
export const privateChairGeometry = mergeBoxes(privateRooms.chairs)
export function stageBoxes(): BoxSpec[] {
  return [
    box(FAN.apexX, 0.2, FAN.apexZ + 0.55, 7.4, 0.32, 3.2),
    box(FAN.apexX, 1.45, FAN.apexZ - 1.25, 6.2, 2.4, 0.12),
  ]
}

export const stageGeometry = mergeBoxes(stageBoxes())
