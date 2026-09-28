import { courtyardHole } from '../massing'
import { pageToWorld, PT_PER_M } from '../scale'
import type { Aabb, Point } from './layout'

/**
 * B1.pdf → site.pdf 的唯一配准（D057）。
 * 旋转 0°。比例只用 B1.pdf 的 126.8 m 尺寸线（页 508→2319.7，366.9）。
 * 整体平移取外墙外角对 site.pdf A-WALL 地下室外墙外角的最小二乘。
 * 西北、东北能对上。西南、东南对不上，不进这组解，原因见 B1_UNPAIRED_CORNERS。
 * 地上的下沉广场和 B1Pick 不参与，也不跟着平移。
 */
export const B1_PT_PER_M = 1811.7 / 126.8
const SITE_PER_B1 = PT_PER_M / B1_PT_PER_M

export const B1_ANCHOR_PAGE = { x: 508, y: 366.9 }
export const B1_ANCHOR_SITE = { x: 1371.2, y: 648.9 }
/** 126.8 m 尺寸线东端，只用来锁比例，不是外墙角。 */
export const B1_EAST_PAGE = { x: 2319.7, y: 366.9 }
export const B1_EAST_SITE = { x: 2424.5, y: 648.9 }

/**
 * 外墙外角。B1 取北墙外皮 y=397 与角柱外皮的交点（西北 x=515.16，东北 x=2327.52）。
 * 这两点间距 126.846 m。site 取 A-WALL 外皮交点：西 x=1368.48 ∩ 北 y=637.76，
 * 东 x=2437.3198 ∩ 北 y=642.6801。东墙中段凸出不在这里。
 */
export const B1_OUTER_CORNERS = [
  { id: 'NW' as const, b1: { x: 515.16, y: 397 }, site: { x: 1368.48, y: 637.76 } },
  { id: 'NE' as const, b1: { x: 2327.52, y: 397 }, site: { x: 2437.3198, y: 642.6801 } },
]

/** 对不上的外角，不进最小二乘。 */
export const B1_UNPAIRED_CORNERS = [
  {
    id: 'SW' as const,
    reason:
      'B1 西南外角是斜墙端点 (495.60, 1152.64)。site A-WALL 西墙外皮在 (1358.76, 888.56) 向东折进，没有再向南收到同一个外角。',
  },
  {
    id: 'SE' as const,
    reason:
      'B1 东墙是直线，南端约在页坐标 y=938 折向西南。site 东墙在东北角以下约 8 m 向东凸到 x=2475.60，南墙外角在 (2420.88, 1671.56)，比 B1 东南角偏南约 60 m。',
  },
]

function b1PageToWorldUnshifted(pageX: number, pageY: number): [number, number] {
  const siteX = B1_ANCHOR_SITE.x + (pageX - B1_ANCHOR_PAGE.x) * SITE_PER_B1
  const siteY = B1_ANCHOR_SITE.y + (pageY - B1_ANCHOR_PAGE.y) * SITE_PER_B1
  return pageToWorld(siteX, siteY)
}

function leastSquaresShift(): { x: number; z: number } {
  let dx = 0
  let dz = 0
  for (const corner of B1_OUTER_CORNERS) {
    const b1 = b1PageToWorldUnshifted(corner.b1.x, corner.b1.y)
    const site = pageToWorld(corner.site.x, corner.site.y)
    dx += b1[0] - site[0]
    dz += b1[1] - site[1]
  }
  const count = B1_OUTER_CORNERS.length
  return { x: -dx / count, z: -dz / count }
}

/** 加到 B1 世界上的平移（米）。x 向东，z 向南。 */
export const B1_WALL_SHIFT = leastSquaresShift()

export function b1PageToWorld(pageX: number, pageY: number): [number, number] {
  const [x, z] = b1PageToWorldUnshifted(pageX, pageY)
  return [x + B1_WALL_SHIFT.x, z + B1_WALL_SHIFT.z]
}

export type WallCornerResidual = {
  id: 'NW' | 'NE'
  dx: number
  dz: number
  meters: number
}

/** dx、dz = 平移后的 B1 世界 − site 世界。 */
export function b1WallCornerResiduals(): WallCornerResidual[] {
  return B1_OUTER_CORNERS.map((corner) => {
    const b1 = b1PageToWorld(corner.b1.x, corner.b1.y)
    const site = pageToWorld(corner.site.x, corner.site.y)
    const dx = b1[0] - site[0]
    const dz = b1[1] - site[1]
    return { id: corner.id, dx, dz, meters: Math.hypot(dx, dz) }
  })
}

export function b1PageToPoint(pageX: number, pageY: number): Point {
  const [x, z] = b1PageToWorld(pageX, pageY)
  return { x, z }
}

function pageBox(x0: number, y0: number, x1: number, y1: number): Aabb {
  const a = b1PageToPoint(x0, y0)
  const b = b1PageToPoint(x1, y1)
  return {
    x0: Math.min(a.x, b.x),
    x1: Math.max(a.x, b.x),
    z0: Math.min(a.z, b.z),
    z1: Math.max(a.z, b.z),
  }
}

/**
 * WALL 层长线段的凸包（页坐标，pt）。x&lt;450 的详图没有并进来。
 * 外墙被门洞拆开，凸包是这些外墙端点的围合，面积约 8000 ㎡。
 */
export const B1_SLAB_PAGE: Array<[number, number]> = [
  [2326.92, 716.44],
  [2325.48, 880.72],
  [2323.68, 937.96],
  [2314.08, 976.48],
  [2182.56, 1266.64],
  [1855.08, 1292.32],
  [1495.44, 1300.0],
  [742.92, 1309.12],
  [704.16, 1309.12],
  [622.44, 1300.0],
  [495.6, 1159.0],
  [495.6, 1152.64],
  [499.44, 606.4],
  [513.24, 397.0],
  [515.16, 384.16],
  [1904.04, 379.84],
  [1906.8, 379.84],
  [2323.68, 397.0],
  [2326.92, 505.0],
]

export function b1SlabOutline(): Array<[number, number]> {
  return B1_SLAB_PAGE.map(([x, y]) => b1PageToWorld(x, y))
}

export function b1SlabBounds(): Aabb {
  const ring = b1SlabOutline()
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

/** 下沉广场标注（B1.pdf），不是场地总图上的那块。 */
export const B1_PLAZA_LABEL_PAGE = { x: 1369.6, y: 1270.7 }
export const B1_PLAZA: Aabb = pageBox(1210, 1155, 1520, 1292)

/** 中庭标注。 */
export const B1_ATRIUM_PAGE = { x: 1108.3, y: 713.3 }
const atriumCenter = b1PageToPoint(B1_ATRIUM_PAGE.x, B1_ATRIUM_PAGE.y)
export const B1_ATRIUM = { cx: atriumCenter.x, cz: atriumCenter.z, rx: 11, rz: 7.2 }

/** 前厅。 */
export const B1_LOBBY: Aabb = pageBox(1521.7, 714.4, 1750.3, 871.6)

/** 厨房一带（标注落在小间里，排除区盖住周围备餐间）。 */
export const B1_KITCHEN: Aabb = pageBox(508, 588, 705, 748)

/** 内部员工餐厅。 */
export const B1_CANTEEN: Aabb = pageBox(1765, 800, 2095, 1085)

/** 报告厅扇形的圆心（页坐标）。座位朝南张开。 */
export const B1_FAN_APEX_PAGE = { x: 860, y: 980 }

/** 北侧电梯厅，尺寸与塔楼核心筒一致。 */
export const B1_CORE: Aabb = pageBox(1004, 399.3, 1184, 540.7)

const ROOM_HALF_X_M = 2.2
const ROOM_HALF_Z_M = 2.6
const ROOM_CENTERS_PAGE: Array<[number, number]> = [
  [759.8, 854.9],
  [1030.3, 869.3],
  [1117.3, 891.8],
  [1203.0, 927.2],
  [1278.1, 970.6],
]

export const B1_ROOMS: Aabb[] = ROOM_CENTERS_PAGE.map(([x, y]) => {
  const center = b1PageToPoint(x, y)
  return {
    x0: center.x - ROOM_HALF_X_M,
    x1: center.x + ROOM_HALF_X_M,
    z0: center.z - ROOM_HALF_Z_M,
    z1: center.z + ROOM_HALF_Z_M,
  }
})

/** 吊顶用的内接矩形，四角都在楼板内。 */
export const B1_CEILING: Aabb = pageBox(560, 460, 2050, 1080)

/** COLUMN 层里落在外墙凸包内的柱心（页坐标，pt）。 */
export const B1_COLUMN_PAGE: Array<[number, number]> = [
  [508.02, 616.42],
  [508.02, 797.14],
  [514.38, 922.9],
  [522.06, 1084.78],
  [550.32, 1215.16],
  [577.26, 922.9],
  [626.58, 1060.84],
  [626.58, 1215.16],
  [645.18, 797.14],
  [649.44, 922.9],
  [743.76, 1060.84],
  [743.76, 1215.16],
  [806.58, 405.58],
  [806.58, 554.26],
  [808.02, 922.9],
  [836.64, 1215.16],
  [850.92, 1077.94],
  [954.78, 1060.42],
  [963.78, 407.02],
  [963.78, 554.26],
  [965.16, 1215.16],
  [978.54, 937.12],
  [1012.5, 1206.7],
  [1012.68, 1254.7],
  [1012.74, 1228.06],
  [1022.82, 1140.22],
  [1092.06, 1266.94],
  [1093.62, 1244.5],
  [1093.62, 1297.48],
  [1095.24, 1169.62],
  [1118.82, 502.06],
  [1120.98, 614.98],
  [1134.18, 980.98],
  [1167.6, 1214.08],
  [1217.34, 1255.96],
  [1243.86, 407.02],
  [1243.86, 554.26],
  [1249.56, 1289.98],
  [1274.28, 1060.24],
  [1329.54, 405.58],
  [1332.42, 502.06],
  [1343.82, 965.74],
  [1392.42, 1171.24],
  [1437.9, 691.9],
  [1448.16, 402.76],
  [1448.16, 512.08],
  [1448.16, 630.7],
  [1482.18, 1094.62],
  [1563.9, 632.14],
  [1564.02, 699.22],
  [1578.18, 630.7],
  [1578.3, 709.9],
  [1587.78, 1251.34],
  [1590.66, 796.78],
  [1693.62, 496.36],
  [1699.86, 915.94],
  [1701.06, 512.08],
  [1701.06, 630.7],
  [1702.5, 403.54],
  [1702.5, 756.46],
  [1776.9, 1057.9],
  [1822.74, 1212.94],
  [1827.54, 756.46],
  [1827.54, 902.2],
  [1828.86, 404.2],
  [1829.7, 474.94],
  [1829.7, 630.7],
  [1882.92, 1212.34],
  [1984.02, 404.2],
  [1984.02, 474.94],
  [1984.02, 630.7],
  [1985.46, 756.46],
  [1985.46, 903.64],
  [1985.46, 1212.34],
  [2115.42, 780.7],
  [2115.42, 902.2],
  [2115.42, 1063.66],
  [2115.42, 1210.9],
  [2138.34, 406.3],
  [2138.34, 474.94],
  [2138.34, 630.7],
  [2202.66, 903.64],
  [2202.66, 1212.34],
  [2231.16, 443.5],
  [2231.16, 543.52],
  [2231.16, 633.58],
  [2316.9, 905.08],
  [2317.62, 779.26],
  [2319.78, 543.52],
  [2319.78, 633.58],
  [2322.6, 888.64],
]

export function b1ColumnPoints(): Point[] {
  return B1_COLUMN_PAGE.map(([x, y]) => b1PageToPoint(x, y))
}

export function ringFromAabb(box: Aabb): Array<[number, number]> {
  return [
    [box.x0, box.z0],
    [box.x1, box.z0],
    [box.x1, box.z1],
    [box.x0, box.z1],
  ]
}

export function ellipseRing(cx: number, cz: number, rx: number, rz: number, segments = 36): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2
    points.push([cx + Math.cos(t) * rx, cz + Math.sin(t) * rz])
  }
  return points
}

export function pointInRing(x: number, z: number, ring: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, zi] = ring[i]
    const [xj, zj] = ring[j]
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

let slabRingCache: Array<[number, number]> | null = null

export function pointInB1Slab(x: number, z: number): boolean {
  if (!slabRingCache) slabRingCache = b1SlabOutline()
  return pointInRing(x, z, slabRingCache)
}

/** 总览双击进 B1 的拾取区：贴场地总图的下沉广场，不跟 B1 内部色块走。 */
export function basementPickOutline(): Array<[number, number]> {
  return courtyardHole()
}

export function ringCentroid(ring: Array<[number, number]>): Point {
  let twice = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, z1] = ring[i]
    const [x2, z2] = ring[(i + 1) % ring.length]
    const cross = x1 * z2 - x2 * z1
    twice += cross
    cx += (x1 + x2) * cross
    cz += (z1 + z2) * cross
  }
  if (Math.abs(twice) < 1e-8) {
    const x = ring.reduce((sum, point) => sum + point[0], 0) / ring.length
    const z = ring.reduce((sum, point) => sum + point[1], 0) / ring.length
    return { x, z }
  }
  return { x: cx / (3 * twice), z: cz / (3 * twice) }
}
