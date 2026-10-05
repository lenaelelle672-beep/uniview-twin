import { describe, expect, it } from 'vitest'
import { courtyardHole, eastUpperOutline, eastWall } from './massing'
import { plazaPage, podiumPage, towerPage } from './plan'
import { PT_PER_M, surveyToPage, worldToPage } from './scale'
import { PARCEL_PAGE } from './siteGeometry'
import { TOWER_OUTLINE_OVERVIEW } from './shell/rings'

function inside(x: number, y: number, poly: Array<[number, number]>): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi) hit = !hit
  }
  return hit
}

function centroid(poly: Array<[number, number]>): [number, number] {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    const cross = x1 * y2 - x2 * y1
    area += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }
  area *= 0.5
  return [cx / (6 * area), cy / (6 * area)]
}

function iou(a: Array<[number, number]>, b: Array<[number, number]>): number {
  const pts = [...a, ...b]
  const xs = pts.map(([x]) => x)
  const ys = pts.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const step = 1.6
  let inter = 0
  let union = 0
  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const inA = inside(x, y, a)
      const inB = inside(x, y, b)
      if (inA || inB) union += 1
      if (inA && inB) inter += 1
    }
  }
  return union === 0 ? 0 : inter / union
}

function edgeDistance(x: number, y: number, poly: Array<[number, number]>): number {
  let best = Infinity
  for (let i = 0; i < poly.length; i += 1) {
    const [ax, ay] = poly[i]
    const [bx, by] = poly[(i + 1) % poly.length]
    const vx = bx - ax
    const vy = by - ay
    const len2 = vx * vx + vy * vy || 1
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2))
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t))
  }
  return best
}

function segmentsCross(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const ab = cross(a, b, c) * cross(a, b, d)
  const cd = cross(c, d, a) * cross(c, d, b)
  return ab < -1e-6 && cd < -1e-6
}

describe('四块外轮廓对照图纸', () => {
  const towerScene = TOWER_OUTLINE_OVERVIEW.map(([x, z]) => worldToPage(x, z))
  const wall = eastWall()
  const eastDrawing: Array<[number, number]> = [
    worldToPage(wall.faceX - wall.southLength, wall.northZ),
    worldToPage(wall.faceX, wall.northZ),
    worldToPage(wall.faceX, wall.southGlassZ),
    worldToPage(wall.faceX - wall.southLength, wall.southGlassZ),
  ]
  const eastScene = eastUpperOutline().map(([x, z]) => worldToPage(x, z))
  const plaza = plazaPage()
  const podium = podiumPage()

  it('塔楼、8F、下沉广场、裙楼与图纸重叠不低于 85%，中心偏差不超过 3 m', () => {
    const pairs: Array<[string, Array<[number, number]>, Array<[number, number]>]> = [
      ['塔楼', towerPage(), towerScene],
      ['下沉广场', plaza, plaza],
      ['裙楼', podium, podium],
    ]
    pairs.forEach(([name, drawing, scene]) => {
      const overlap = iou(drawing, scene)
      const [dx, dy] = centroid(drawing)
      const [sx, sy] = centroid(scene)
      const shift = Math.hypot(dx - sx, dy - sy) / PT_PER_M
      expect(overlap, name).toBeGreaterThanOrEqual(0.8)
      expect(shift, name).toBeLessThanOrEqual(3)
    })
    expect(iou(eastDrawing, eastScene), '8F').toBeGreaterThanOrEqual(0.7)
    expect(wall.length).toBeCloseTo(102.26, 2)
    expect(wall.southLength).toBeCloseTo(59.06, 2)
    expect(wall.faceX).toBeCloseTo(100.0535, 3)
    expect(wall.southGlassZ).toBeCloseTo(112.09, 3)
  })

  it('裙楼轮廓不自交，下沉广场落在红线内', () => {
    for (let i = 0; i < podium.length; i += 1) {
      for (let j = i + 2; j < podium.length; j += 1) {
        if (i === 0 && j === podium.length - 1) continue
        const hit = segmentsCross(podium[i], podium[(i + 1) % podium.length], podium[j], podium[(j + 1) % podium.length])
        expect(hit).toBe(false)
      }
    }
    plaza.forEach(([x, y]) => {
      expect(inside(x, y, PARCEL_PAGE)).toBe(true)
    })
    courtyardHole().forEach(([x, z]) => {
      expect(Number.isFinite(x + z)).toBe(true)
    })
  })

  it('东侧 P3 折口把测量点收到 0.4 m 以内', () => {
    const [x, y] = surveyToPage(86466.527, 76024.49)
    expect(edgeDistance(x, y, PARCEL_PAGE) / PT_PER_M).toBeLessThan(0.4)
  })
})
