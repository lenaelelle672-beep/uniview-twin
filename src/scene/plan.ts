import { pageToWorld, PT_PER_M, surveyToPage } from './scale'

/** 弧形裙楼 / 下沉广场的圆心（site.pdf 页面 pt）。半径误差约 0.01 m。 */
export const ARC_CENTER_PAGE: [number, number] = [1582.27, 1354.09]

/** 朝向下沉广场的外墙，落到 8F 西北角 (1961.88, 1354.09)。 */
const FRONT_RADIUS_PT = 379.61
/** 下沉广场外缘、内缘（台阶最内侧）。 */
const PLAZA_OUTER_PT = 366.31
const PLAZA_INNER_PT = 171.03
const PLAZA_A0 = (-83.5 * Math.PI) / 180

function arcPoints(radiusPt: number, a0: number, a1: number, steps: number): Array<[number, number]> {
  const [cx, cy] = ARC_CENTER_PAGE
  const points: Array<[number, number]> = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = a0 + ((a1 - a0) * i) / steps
    points.push([cx + Math.cos(angle) * radiusPt, cy + Math.sin(angle) * radiusPt])
  }
  return points
}

function cubicPoints(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  steps: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const u = 1 - t
    points.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return points
}

function dedupe(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  points.forEach((point) => {
    const prev = out[out.length - 1]
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 0.15) out.push(point)
  })
  return out
}

/** 塔楼虚线矩形：X 76021.29–76048.69，Y 86295.28–86355.182。 */
export function towerPage(): Array<[number, number]> {
  const nw = surveyToPage(86295.28, 76048.69)
  const ne = surveyToPage(86355.182, 76048.69)
  const se = surveyToPage(86355.182, 76021.29)
  const sw = surveyToPage(86295.28, 76021.29)
  return [nw, ne, se, sw]
}

/** 下沉广场：同心圆弧带，外缘弦长约 59 m，径向宽约 23.5 m。 */
export function plazaPage(): Array<[number, number]> {
  const outer = arcPoints(PLAZA_OUTER_PT, PLAZA_A0, 0, 28)
  const inner = arcPoints(PLAZA_INNER_PT, 0, PLAZA_A0, 18)
  return dedupe([...outer, ...inner])
}

/**
 * 弧形裙楼外轮廓。
 * 凹侧（朝向圆心、西南）是下沉广场外的 r=45.71 m 外墙，从塔楼南侧接到 8F 西北角。
 * 凸侧是 stroke-width 6 的粗弧（西段 r≈71.7 m，东端收到 8F）。
 */
export function podiumPage(): Array<[number, number]> {
  const front = arcPoints(FRONT_RADIUS_PT, 0, -Math.PI / 2, 32)
  const southY = surveyToPage(86355.182, 76021.29)[1]
  const towerEast = surveyToPage(86355.182, 76021.29)[0]
  const farWest = cubicPoints([1910.11, 858.24], [1962.5, 887.49], [2007.16, 928.8], [2040.39, 978.76], 12)
  const farEast = cubicPoints([2040.34, 978.87], [2089.38, 1052.57], [2099.98, 1145.36], [2068.84, 1228.23], 12)
  return dedupe([
    ...front,
    [ARC_CENTER_PAGE[0], southY],
    [towerEast, southY],
    ...farWest,
    ...farEast,
  ])
}

export function podiumFrontPage(): Array<[number, number]> {
  return arcPoints(FRONT_RADIUS_PT, 0, -Math.PI / 2, 32)
}

export function pageRingToWorld(points: Array<[number, number]>): Array<[number, number]> {
  return points.map(([x, y]) => pageToWorld(x, y))
}

export const PLAZA_OUTER_M = PLAZA_OUTER_PT / PT_PER_M
export const PLAZA_INNER_M = PLAZA_INNER_PT / PT_PER_M
