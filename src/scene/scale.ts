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
 * 东南 8F 体块的外墙（site.pdf 粗线）。塔楼不在这块上。
 * 东西 98.5 m，南北 51.0 m。
 */
export const FOOTPRINT_PAGE = {
  west: 1801.56,
  east: 2619.72,
  north: 1385.72,
  south: 1809.32,
} as const

export const TOWER_WIDTH_M = 67
export const TOWER_DEPTH_M = 27

/**
 * 22F 塔楼平面中心。测量坐标北墙 X=76048.690，东西角 Y=86355.182 / 86422.082
 * （66.90 m），西墙进深 27.4 m。矩形按 67×27 m 贴住北墙和东西角。
 * 页面位置由用地西北角 (1099.1, 455.1) = (Y=86262.511, X=76072.020) 和比例条 8.306 pt/m 换算。
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

const TOWER_NORTH_Y = surveyToPage(86355.182, 76048.69)[1]
const TOWER_WEST_X = surveyToPage(86355.182, 76048.69)[0]
const TOWER_EAST_X = surveyToPage(86422.082, 76048.69)[0]

export const ORIGIN_PAGE_X = (TOWER_WEST_X + TOWER_EAST_X) / 2
export const ORIGIN_PAGE_Y = TOWER_NORTH_Y + (TOWER_DEPTH_M * PT_PER_M) / 2

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
