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
 * 用地范围线，页面坐标（pt）。顶点是 site.pdf 上 stroke-width 2 的红线端点，
 * 不是内侧停车带（y≈493）。北段 (1099.1,455.1)–(2807.8,453.8) 与测量角点重合，
 * 南折点 (1869.4,1934.7) 与 X=75893.890 / Y=86355.251 重合。面积约 29980 ㎡。
 */
export const PARCEL_PAGE: Array<[number, number]> = [
  [1099.1, 455.1],
  [2807.8, 453.8],
  // 东侧 P3：边界在 y≈850 向西折进约 1.96 m（十字缺口端点 2787.84, 849.92）
  [2804.14, 846.5],
  [2787.84, 849.92],
  [2804.07, 853.4],
  [2803.1, 957.4],
  [2755.1, 1205.0],
  [2749.8, 1786.4],
  [2739.8, 1834.4],
  [2713.0, 1873.7],
  [2673.5, 1900.1],
  [2625.2, 1909.8],
  [2044.2, 1909.8],
  [1869.4, 1934.7],
  [1723.7, 1934.7],
  [1699.0, 1930.4],
  [1677.6, 1918.7],
  [1661.1, 1900.7],
  [1651.1, 1877.8],
  [1575.64, 1570.14],
  [1527.31, 1420.85],
  [1456.64, 1281.81],
  [1365.13, 1155.5],
  [1254.39, 1044.5],
  [1172.72, 955.33],
  [1115.57, 850.7],
  [1084.9, 735.5],
  [1082.5, 614.6],
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

/** 下沉广场深 5.5 m 接 B1。侧壁内收，总览能看到内壁。 */
export const COURT_DEPTH_M = 5.5
export const COURT_SLOPE_M = 4.5

export { CURVED_RND_ROOF_M as PODIUM_HEIGHT_M, EAST_PARAPET_TOP_M as EAST_ROOF_M } from '../data/levels'
/** 上部南侧弧面相对下层向外悬挑。 */
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
function segmentOutward(a: [number, number], b: [number, number]): [number, number] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  let nx = -(b[1] - a[1]) / len
  let ny = (b[0] - a[0]) / len
  const [ox, oy] = outwardPage((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
  if (nx * ox + ny * oy < 0) {
    nx = -nx
    ny = -ny
  }
  return [nx, ny]
}

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
  const [nx, ny] = segmentOutward(a, b)
  const rotY =
    armOutward === undefined ? 0 : armRotation(armOutward ? nx : -nx, armOutward ? ny : -ny)
  const out: Placement[] = []
  const count = Math.floor((len / PT_PER_M - phase) / spacing)
  for (let i = 0; i <= count; i += 1) {
    const distM = phase + i * spacing
    if (distM < 0 || distM * PT_PER_M > len - 1) continue
    const px = a[0] + dx * distM * PT_PER_M + nx * offsetM * PT_PER_M
    const py = a[1] + dy * distM * PT_PER_M + ny * offsetM * PT_PER_M
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
      [2044.2, 1909.8],
      [2625.2, 1909.8],
    ],
    [
      [1869.4, 1934.7],
      [2044.2, 1909.8],
    ],
    [
      [1723.7, 1934.7],
      [1869.4, 1934.7],
    ],
    [
      [1651.1, 1877.8],
      [1723.7, 1934.7],
    ],
  ]
  southEdges.forEach(([a, b], index) => {
    trees.push(...sampleSegment(a, b, 8, 3.2, index * 0.6))
    trees.push(...sampleSegment(a, b, 8, 12, 4 + index * 0.6))
    lamps.push(...sampleSegment(a, b, 30, 2.4, 8, true))
    lamps.push(...sampleSegment(a, b, 30, 10.6, 23, false))
  })

  const eastA: [number, number] = [2749.8, 1786.4]
  const eastB: [number, number] = [2803.1, 957.4]
  trees.push(...sampleSegment(eastA, eastB, 8, 3.2, 2))
  trees.push(...sampleSegment(eastA, eastB, 8, 11.5, 6))
  lamps.push(...sampleSegment(eastA, eastB, 30, 2.2, 5, true))
  lamps.push(...sampleSegment(eastA, eastB, 30, 10.4, 20, false))

  const westA: [number, number] = [1254.39, 1044.5]
  const westB: [number, number] = [1575.64, 1570.14]
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
  const [ox, oy] = segmentOutward(a, b)
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
    offsetRibbon([1723.7, 1934.7], [2044.2, 1909.8], 9, 6),
    offsetRibbon([2044.2, 1909.8], [2625.2, 1909.8], 9, 6),
    offsetRibbon([2749.8, 1786.4], [2803.1, 957.4], 9, 5.5),
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
  addCrossing(2300, 1984, 12)
  return stripes
}

export const SITE_DRAWING = {
  originPageX: ORIGIN_PAGE_X,
  originPageY: ORIGIN_PAGE_Y,
  footprintPage: FOOTPRINT_PAGE,
}
