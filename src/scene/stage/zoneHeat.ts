import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshBasicMaterial, Shape, ShapeGeometry, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Alarm, Device } from '../../types'
import { getFloorPlan } from '../../floors/cache'
import { b1ZoneRings } from '../b1Zones'
import { pointInRing } from './b1Plan'
import { workstationPosition } from './workstationPosition'

/** 0 绿，1 黄，≥2 红。同一告警数永远同一色。 */
export const ZONE_HEAT_COLOR = {
  green: '#2faf62',
  yellow: '#e6b325',
  red: '#e04545',
} as const

/** 半透明，楼板和标签仍能读。 */
export const ZONE_HEAT_OPACITY = 0.58

/**
 * 高于默认楼板（0），低于房间标签（3）和徽标。
 * 常量留在热力分包里，避免把排序数字写进首屏 overlayOrder。
 */
export const ZONE_HEAT_ORDER = 1

/**
 * 室内局部抬高（米）。
 * B1 色块顶最高约在室内局部 0.16（前厅抬 0.2 再挤 0.12），0.2 让热力盖过色块顶，
 * 仍低于桌面（约 0.76）。再加 polygonOffset，避免和楼板共面闪烁。
 */
export const ZONE_HEAT_LIFT = 0.2

export function heatColorForCount(count: number): string {
  if (count <= 0) return ZONE_HEAT_COLOR.green
  if (count === 1) return ZONE_HEAT_COLOR.yellow
  return ZONE_HEAT_COLOR.red
}

function ringArea(ring: Array<[number, number]>): number {
  let sum = 0
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    const [x0, z0] = ring[prev]!
    const [x1, z1] = ring[index]!
    sum += x0 * z1 - x1 * z0
  }
  return Math.abs(sum) / 2
}

function distToSegment(x: number, z: number, a: [number, number], b: [number, number]): number {
  const abx = b[0] - a[0]
  const abz = b[1] - a[1]
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-12) return Math.hypot(x - a[0], z - a[1])
  let t = ((x - a[0]) * abx + (z - a[1]) * abz) / len2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  return Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t))
}

function distToRing(x: number, z: number, ring: Array<[number, number]>): number {
  let best = Infinity
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    best = Math.min(best, distToSegment(x, z, ring[prev]!, ring[index]!))
  }
  return best
}

/** B1 用色块环。其它层用已加载图纸里的房间多边形。没有环就不画。 */
export function zoneRingsForFloor(floorId: string): Array<Array<[number, number]>> {
  if (floorId === 'B1') return b1ZoneRings().filter((ring) => ring.length >= 3 && ringArea(ring) > 1e-4)
  const plan = getFloorPlan(floorId)
  if (!plan) return []
  const rings: Array<Array<[number, number]>> = []
  for (const room of plan.rooms) {
    const ring = room.polygon
    if (!ring || ring.length < 3 || ringArea(ring) <= 1e-4) continue
    rings.push(ring)
  }
  return rings
}

export interface AlarmPoint {
  x: number
  z: number
}

/** 本层能落到工位的告警。没有工位号、或图纸还没把工位排出来的，不参与着色。 */
export function alarmPointsOnFloor(floorId: string, alarms: readonly Alarm[], devices: readonly Device[]): AlarmPoint[] {
  const byId = new Map(devices.map((device) => [device.id, device]))
  const points: AlarmPoint[] = []
  for (const alarm of alarms) {
    if (alarm.floorId !== floorId) continue
    const device = byId.get(alarm.deviceId)
    if (!device || device.floorId !== floorId || !device.deskId) continue
    try {
      const place = workstationPosition(floorId, device.deskId)
      points.push({ x: place.x, z: place.z })
    } catch {
      // 工位编号对不上图纸时跳过这一条，不让整层热力挂掉。
    }
  }
  return points
}

/**
 * 点在区内：归面积最小的那块（房间套在大厅里时算房间）。
 * 点在所有区外：归最近的区边。B1 工位刻意排在色块外，最近边才能把告警数画出来。
 */
export function countAlarmsPerZone(rings: readonly (readonly (readonly [number, number])[])[], points: readonly AlarmPoint[]): number[] {
  const counts = rings.map(() => 0)
  const areas = rings.map((ring) => ringArea(ring as Array<[number, number]>))
  for (const point of points) {
    let insideBest = -1
    let insideArea = Infinity
    let outsideBest = -1
    let outsideDist = Infinity
    let outsideArea = Infinity
    for (let index = 0; index < rings.length; index += 1) {
      const ring = rings[index] as Array<[number, number]>
      const area = areas[index] ?? 0
      if (pointInRing(point.x, point.z, ring)) {
        if (area < insideArea) {
          insideArea = area
          insideBest = index
        }
        continue
      }
      const dist = distToRing(point.x, point.z, ring)
      const closer = dist < outsideDist - 1e-4
      const tie = Math.abs(dist - outsideDist) <= 1e-4 && area < outsideArea
      if (closer || tie) {
        outsideDist = dist
        outsideArea = area
        outsideBest = index
      }
    }
    const best = insideBest >= 0 ? insideBest : outsideBest
    if (best >= 0) counts[best] = (counts[best] ?? 0) + 1
  }
  return counts
}

export function zoneAlarmCounts(floorId: string, alarms: readonly Alarm[], devices: readonly Device[]): number[] {
  const rings = zoneRingsForFloor(floorId)
  if (rings.length === 0) return []
  return countAlarmsPerZone(rings, alarmPointsOnFloor(floorId, alarms, devices))
}

function paint(geometry: BufferGeometry, hex: string) {
  const color = new Color(hex)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

/** 贴地。XY 的 Shape 转到 XZ，和 extrudeUp 同一套 (x, -z) 再 rotateX。 */
export function flatZoneGeometry(ring: Array<[number, number]>): BufferGeometry {
  const shape = new Shape(ring.map(([x, z]) => new Vector2(x, -z)))
  const geometry = new ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/** 多区收成一个带顶点色、无分组的几何。空环返回 null，调用方不挂 mesh。 */
export function buildHeatGeometryFromRings(
  rings: readonly (readonly (readonly [number, number])[])[],
  counts: readonly number[],
): BufferGeometry | null {
  if (rings.length === 0) return null
  const parts: BufferGeometry[] = []
  for (let index = 0; index < rings.length; index += 1) {
    const ring = rings[index] as Array<[number, number]>
    if (ring.length < 3) continue
    const geometry = paint(flatZoneGeometry(ring), heatColorForCount(counts[index] ?? 0))
    if (geometry.getAttribute('position').count === 0) {
      geometry.dispose()
      continue
    }
    parts.push(geometry)
  }
  if (parts.length === 0) return null
  const merged = mergeGeometries(parts, false)
  for (const geometry of parts) geometry.dispose()
  if (!merged || merged.getAttribute('position').count === 0) {
    merged?.dispose()
    return null
  }
  merged.clearGroups()
  merged.computeBoundingSphere()
  return merged
}

export function buildZoneHeatGeometry(floorId: string, alarms: readonly Alarm[], devices: readonly Device[]): BufferGeometry | null {
  const rings = zoneRingsForFloor(floorId)
  if (rings.length === 0) return null
  return buildHeatGeometryFromRings(rings, countAlarmsPerZone(rings, alarmPointsOnFloor(floorId, alarms, devices)))
}

/** 一个材质，整层一次绘制。受雾影响，不写深度，polygonOffset 往相机偏一点。 */
export function createZoneHeatMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: ZONE_HEAT_OPACITY,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: DoubleSide,
  })
}
