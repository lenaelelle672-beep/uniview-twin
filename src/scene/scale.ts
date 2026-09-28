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

/**
 * 东南 8F 外墙细线（不是 stroke-width 6 的地下室外轮廓）。
 * 西 1961.88 / 东 2451.1 / 北 1354.16 / 南 1701.8，约 58.9 m × 41.9 m。
 */
export const FOOTPRINT_PAGE = {
  west: 1961.88,
  east: 2451.1,
  north: 1354.16,
  south: 1701.8,
} as const

/**
 * 用地西北角 (1099.1, 455.1) = (Y=86262.511, X=76072.020)。
 * 北红线长 1708.7 pt，对应东距 86262.511→86468.220。
 */
const SURVEY_PT_PER_M = 1708.7 / (86468.22 - 86262.511)
const SURVEY_NW_PAGE_X = 1099.1
const SURVEY_NW_PAGE_Y = 455.1
const SURVEY_NW_EASTING = 86262.511
const SURVEY_NW_NORTHING = 76072.02

export function surveyToPage(easting: number, northing: number): [number, number] {
  return [
    SURVEY_NW_PAGE_X + (easting - SURVEY_NW_EASTING) * SURVEY_PT_PER_M,
    SURVEY_NW_PAGE_Y - (northing - SURVEY_NW_NORTHING) * SURVEY_PT_PER_M,
  ]
}

/**
 * 22F 塔楼。东墙是 Y=86355.182（不是西墙）；西墙是 Y=86295.28。
 * 北墙 X=76048.690，南墙 X=76021.290。图上 59.90 m × 27.40 m。
 * 世界原点是这块矩形的平面中心。
 */
const TOWER_NW = surveyToPage(86295.28, 76048.69)
const TOWER_SE = surveyToPage(86355.182, 76021.29)

export const TOWER_WIDTH_M = (TOWER_SE[0] - TOWER_NW[0]) / PT_PER_M
export const TOWER_DEPTH_M = (TOWER_SE[1] - TOWER_NW[1]) / PT_PER_M
export const ORIGIN_PAGE_X = (TOWER_NW[0] + TOWER_SE[0]) / 2
export const ORIGIN_PAGE_Y = (TOWER_NW[1] + TOWER_SE[1]) / 2

export function pageToWorld(pageX: number, pageY: number): [number, number] {
  return [(pageX - ORIGIN_PAGE_X) / PT_PER_M, (pageY - ORIGIN_PAGE_Y) / PT_PER_M]
}

export function worldToPage(x: number, z: number): [number, number] {
  return [ORIGIN_PAGE_X + x * PT_PER_M, ORIGIN_PAGE_Y + z * PT_PER_M]
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
