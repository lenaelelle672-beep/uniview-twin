import {
  FOOTPRINT_PAGE,
  ORIGIN_PAGE_X,
  ORIGIN_PAGE_Y,
  pageToWorld,
  polygonArea,
  PT_PER_M,
  TOWER_DEPTH_M,
  TOWER_WIDTH_M,
} from './scale'

/**
 * 用地红线，页面坐标（pt）。顶点取自 site.pdf 粗线（stroke-width 6）。
 * 北界 y≈493 横跨机动车出入口的缺口在同一直线上补齐。
 * 面积约 29465 ㎡，图纸“建设用地面积”为 29991 ㎡。
 */
export const PARCEL_PAGE: Array<[number, number]> = [
  [1070.2, 613.4],
  [1113.5, 611.1],
  [1149.5, 514.9],
  [1252.6, 485.6],
  [1264.2, 487.9],
  [1276.0, 489.8],
  [1287.7, 491.2],
  [1299.6, 492.3],
  [1311.5, 492.9],
  [1323.4, 493.2],
  [2661.2, 493.2],
  [2734.7, 523.5],
  [2764.3, 596.9],
  [2836.0, 550.4],
  [2834.0, 809.0],
  [2792.0, 849.9],
  [2822.1, 990.7],
  [2780.0, 1207.4],
  [2774.7, 1786.6],
  [2625.3, 1934.7],
  [2045.9, 1934.7],
  [1871.2, 1959.7],
  [1736.5, 1959.6],
  [1639.7, 1883.7],
  [1562.1, 1567.1],
  [1513.0, 1367.2],
  [1402.6, 1187.7],
  [1246.2, 1053.9],
]

export const PARCEL_WORLD: Array<[number, number]> = PARCEL_PAGE.map(([x, y]) => pageToWorld(x, y))

export function parcelAreaM2(): number {
  return polygonArea(PARCEL_WORLD)
}

export const FOOTPRINT = {
  minX: pageToWorld(FOOTPRINT_PAGE.west, FOOTPRINT_PAGE.north)[0],
  maxX: pageToWorld(FOOTPRINT_PAGE.east, FOOTPRINT_PAGE.north)[0],
  minZ: pageToWorld(FOOTPRINT_PAGE.west, FOOTPRINT_PAGE.north)[1],
  maxZ: pageToWorld(FOOTPRINT_PAGE.west, FOOTPRINT_PAGE.south)[1],
}

export function footprintOutline(): Array<[number, number]> {
  return [
    [FOOTPRINT.minX, FOOTPRINT.minZ],
    [FOOTPRINT.maxX, FOOTPRINT.minZ],
    [FOOTPRINT.maxX, FOOTPRINT.maxZ],
    [FOOTPRINT.minX, FOOTPRINT.maxZ],
  ]
}

export const TOWER = {
  minX: -TOWER_WIDTH_M / 2,
  maxX: TOWER_WIDTH_M / 2,
  minZ: -TOWER_DEPTH_M / 2,
  maxZ: TOWER_DEPTH_M / 2,
}

/** 椭圆下沉庭院，长轴东西向约 30 m，深 5.5 m 接 B1。 */
export const COURTYARD = {
  cx: 0,
  cz: 24,
  rx: 15,
  rz: 8.2,
  depth: 5.5,
}

export const PODIUM_HEIGHT_M = 6 + 4.2
export const EAST_ROOF_M = 6 + 4 * 4.2
export const EAST_CANTILEVER_M = 4

export interface Placement {
  x: number
  z: number
  rotY: number
}

const NORTH_ROAD = {
  yCurbSouth: 442,
  yCurbNorth: 367.3,
  x0: 1201.4,
  x1: 2721.8,
}

function outwardPage(pageX: number, pageY: number): [number, number] {
  const vx = pageX - ORIGIN_PAGE_X
  const vy = pageY - ORIGIN_PAGE_Y
  const len = Math.hypot(vx, vy) || 1
  return [vx / len, vy / len]
}

/** 路灯挑臂默认朝 +X。返回值使 +X 转到世界方向 (east, south)。 */
export function armRotation(east: number, south: number): number {
  return Math.atan2(-south, east)
}

/**
 * 沿页面线段布点。offsetM 沿远离塔楼的方向为正。
 * armOutward 为 true 时挑臂朝外，false 时朝内；省略则不旋转（行道树）。
 */
function sampleSegment(
  a: [number, number],
  b: [number, number],
  spacing: number,
  offsetM: number,
  phase = 0,
  armOutward?: boolean,
): Placement[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1) return []
  const dx = (b[0] - a[0]) / len
  const dy = (b[1] - a[1]) / len
  const midX = (a[0] + b[0]) / 2
  const midY = (a[1] + b[1]) / 2
  const [ox, oy] = outwardPage(midX, midY)
  const rotY =
    armOutward === undefined ? 0 : armRotation(armOutward ? ox : -ox, armOutward ? oy : -oy)
  const out: Placement[] = []
  const count = Math.floor((len / PT_PER_M - phase) / spacing)
  for (let i = 0; i <= count; i += 1) {
    const distM = phase + i * spacing
    if (distM < 0 || distM * PT_PER_M > len - 1) continue
    const px = a[0] + dx * distM * PT_PER_M + ox * offsetM * PT_PER_M
    const py = a[1] + dy * distM * PT_PER_M + oy * offsetM * PT_PER_M
    const [x, z] = pageToWorld(px, py)
    out.push({ x, z, rotY })
  }
  return out
}

/** 沿用地边线布置行道树（8 m）和路灯（30 m，两侧交错）。西侧是公园，只种树。 */
export function placeStreetFurniture(): { trees: Placement[]; lamps: Placement[] } {
  const trees: Placement[] = []
  const lamps: Placement[] = []

  const northA: [number, number] = [NORTH_ROAD.x0, NORTH_ROAD.yCurbSouth]
  const northB: [number, number] = [NORTH_ROAD.x1, NORTH_ROAD.yCurbSouth]
  const northOuterA: [number, number] = [NORTH_ROAD.x0, NORTH_ROAD.yCurbNorth]
  const northOuterB: [number, number] = [NORTH_ROAD.x1, NORTH_ROAD.yCurbNorth]
  trees.push(...sampleSegment(northA, northB, 8, -2.6, 1))
  trees.push(...sampleSegment(northOuterA, northOuterB, 8, 2.6, 5))
  lamps.push(...sampleSegment(northA, northB, 30, -1.8, 6, true))
  lamps.push(...sampleSegment(northOuterA, northOuterB, 30, 1.8, 21, false))

  const southEdges: Array<[[number, number], [number, number]]> = [
    [
      [2045.9, 1934.7],
      [2625.3, 1934.7],
    ],
    [
      [1871.2, 1959.7],
      [2045.9, 1934.7],
    ],
    [
      [1736.5, 1959.6],
      [1871.2, 1959.7],
    ],
    [
      [1639.7, 1883.7],
      [1736.5, 1959.6],
    ],
  ]
  southEdges.forEach(([a, b], index) => {
    trees.push(...sampleSegment(a, b, 8, 3.2, index * 0.6))
    trees.push(...sampleSegment(a, b, 8, 12, 4 + index * 0.6))
    lamps.push(...sampleSegment(a, b, 30, 2.4, 8, true))
    lamps.push(...sampleSegment(a, b, 30, 10.6, 23, false))
  })

  const eastA: [number, number] = [2774.7, 1786.6]
  const eastB: [number, number] = [2780.0, 1207.4]
  trees.push(...sampleSegment(eastA, eastB, 8, 3.2, 2))
  trees.push(...sampleSegment(eastA, eastB, 8, 11.5, 6))
  lamps.push(...sampleSegment(eastA, eastB, 30, 2.2, 5, true))
  lamps.push(...sampleSegment(eastA, eastB, 30, 10.4, 20, false))

  const westA: [number, number] = [1246.2, 1053.9]
  const westB: [number, number] = [1562.1, 1567.1]
  trees.push(...sampleSegment(westA, westB, 8, 4.5, 2))

  return { trees, lamps }
}

export interface Ribbon {
  a: [number, number]
  b: [number, number]
  halfWidth: number
}

function offsetRibbon(
  a: [number, number],
  b: [number, number],
  outwardM: number,
  halfWidth: number,
): Ribbon {
  const midX = (a[0] + b[0]) / 2
  const midY = (a[1] + b[1]) / 2
  const [ox, oy] = outwardPage(midX, midY)
  const shift = outwardM * PT_PER_M
  return {
    a: pageToWorld(a[0] + ox * shift, a[1] + oy * shift),
    b: pageToWorld(b[0] + ox * shift, b[1] + oy * shift),
    halfWidth,
  }
}

/** 规划路、月明路、东侧路的中心线（世界坐标）和半宽。 */
export function roadRibbons(): Ribbon[] {
  const northCenterY = (NORTH_ROAD.yCurbNorth + NORTH_ROAD.yCurbSouth) / 2
  const northHalf = Math.abs(NORTH_ROAD.yCurbSouth - NORTH_ROAD.yCurbNorth) / 2 / PT_PER_M
  return [
    {
      a: pageToWorld(NORTH_ROAD.x0, northCenterY),
      b: pageToWorld(NORTH_ROAD.x1, northCenterY),
      halfWidth: northHalf,
    },
    offsetRibbon([1736.5, 1959.6], [2045.9, 1934.7], 9, 6),
    offsetRibbon([2045.9, 1934.7], [2625.3, 1934.7], 9, 6),
    offsetRibbon([2774.7, 1786.6], [2780.0, 1207.4], 9, 5.5),
  ]
}

export function sidewalkRibbons(): Ribbon[] {
  return roadRibbons().map((ribbon) => ({ ...ribbon, halfWidth: ribbon.halfWidth + 3.2 }))
}

export interface Stripe {
  x: number
  z: number
  length: number
  width: number
}

export function zebraStripes(): Stripe[] {
  const stripes: Stripe[] = []
  const addCrossing = (pageX: number, pageY: number, roadWidth: number) => {
    const count = 8
    const gap = 0.95
    for (let i = 0; i < count; i += 1) {
      const along = (i - (count - 1) / 2) * gap
      const [x, z] = pageToWorld(pageX + along * PT_PER_M, pageY)
      stripes.push({ x, z, length: roadWidth * 0.92, width: 0.45 })
    }
  }
  const midY = (NORTH_ROAD.yCurbNorth + NORTH_ROAD.yCurbSouth) / 2
  const roadW = (NORTH_ROAD.yCurbSouth - NORTH_ROAD.yCurbNorth) / PT_PER_M
  addCrossing(1616, midY, roadW)
  addCrossing(2279, midY, roadW)
  addCrossing(2210, 1995, 12)
  return stripes
}

export const SITE_DRAWING = {
  originPageX: ORIGIN_PAGE_X,
  originPageY: ORIGIN_PAGE_Y,
  footprintPage: FOOTPRINT_PAGE,
}
