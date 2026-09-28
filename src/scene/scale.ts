/**
 * 总平面图比例尺来自 site.pdf 图面比例条（0–50 m）。
 * pdftocairo 导出后，比例条两端刻度间距为 415.3 pt = 50 m。
 * 页面坐标：x 向东，y 向下（南）。世界坐标：x 向东，z 向南，y 向上。
 */

export const SCALE_BAR_POINTS = 415.3
export const SCALE_BAR_METERS = 50
export const PT_PER_M = SCALE_BAR_POINTS / SCALE_BAR_METERS

export function pointsToMeters(points: number): number {
  return points / PT_PER_M
}

/** 塔楼平面中心在图面上的位置。塔楼贴在地上建筑轮廓的西北角，宽 67 m、深 27 m。 */
export const FOOTPRINT_PAGE = {
  west: 1801.56,
  east: 2619.72,
  north: 1385.72,
  south: 1809.32,
} as const

export const TOWER_WIDTH_M = 67
export const TOWER_DEPTH_M = 27

export const ORIGIN_PAGE_X = FOOTPRINT_PAGE.west + (TOWER_WIDTH_M * PT_PER_M) / 2
export const ORIGIN_PAGE_Y = FOOTPRINT_PAGE.north + (TOWER_DEPTH_M * PT_PER_M) / 2

export function pageToWorld(pageX: number, pageY: number): [number, number] {
  return [(pageX - ORIGIN_PAGE_X) / PT_PER_M, (pageY - ORIGIN_PAGE_Y) / PT_PER_M]
}

export function polygonArea(points: Array<[number, number]>): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}
