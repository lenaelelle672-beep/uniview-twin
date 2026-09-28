import { describe, expect, it } from 'vitest'
import { ORIGIN_PAGE_X, ORIGIN_PAGE_Y, pageToWorld, pointsToMeters, PT_PER_M, surveyToPage } from './scale'
import {
  FOOTPRINT,
  PARCEL_PAGE,
  parcelAreaM2,
  placeStreetFurniture,
  roadRibbons,
  TOWER,
  zebraStripes,
} from './siteGeometry'

function gaps(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const result: number[] = []
  for (let i = 1; i < sorted.length; i += 1) result.push(sorted[i] - sorted[i - 1])
  return result
}

describe('总平面图轮廓换算', () => {
  it('比例条 415.3 pt 等于 50 m', () => {
    expect(pointsToMeters(415.3)).toBeCloseTo(50, 5)
    expect(PT_PER_M).toBeCloseTo(8.306, 5)
  })

  it('塔楼中心落到世界原点，平面为东西 59.90 m、南北 27.40 m', () => {
    expect(pageToWorld(ORIGIN_PAGE_X, ORIGIN_PAGE_Y)).toEqual([0, 0])
    expect(TOWER.maxX - TOWER.minX).toBeCloseTo(59.9, 1)
    expect(TOWER.maxZ - TOWER.minZ).toBeCloseTo(27.4, 1)
  })

  it('8F 南墙 51.90 m、东墙 97.40 m，红线面积接近图纸 29991 ㎡', () => {
    expect(FOOTPRINT.maxX - FOOTPRINT.minX).toBeCloseTo(51.9, 1)
    expect(FOOTPRINT.maxZ - FOOTPRINT.minZ).toBeCloseTo(97.4, 1)
    const area = parcelAreaM2()
    expect(area).toBeGreaterThan(28000)
    expect(area).toBeLessThan(31000)
  })

  it('行道树间距约 8 m，路灯间距约 30 m 且两侧交错', () => {
    const { trees, lamps } = placeStreetFurniture()
    const northTrees = trees.filter((item) => item.z < -32 && item.z > -40)
    const northLamps = lamps.filter((item) => item.z < -32 && item.z > -40)
    const farLamps = lamps.filter((item) => item.z < -44)
    expect(northTrees.length).toBeGreaterThan(10)
    expect(northLamps.length).toBeGreaterThan(3)
    const treeGap = gaps(northTrees.map((item) => item.x))
    const lampGap = gaps(northLamps.map((item) => item.x))
    expect(Math.min(...treeGap)).toBeGreaterThan(7.5)
    expect(Math.max(...treeGap)).toBeLessThan(8.5)
    expect(Math.min(...lampGap)).toBeGreaterThan(29)
    expect(Math.max(...lampGap)).toBeLessThan(31)
    const stagger = northLamps.map((lamp) => {
      const nearest = farLamps.reduce((best, other) => Math.min(best, Math.abs(other.x - lamp.x)), Infinity)
      return nearest
    })
    expect(Math.min(...stagger)).toBeGreaterThan(10)
    expect(Math.abs(northLamps[0].rotY - Math.PI / 2)).toBeLessThan(0.25)
  })

  it('红线四个角贴住测量点或折点，偏差不超过 3 m', () => {
    const targets: Array<[number, number]> = [
      surveyToPage(86262.511, 76072.02),
      surveyToPage(86468.22, 76072.174),
      surveyToPage(86355.251, 75893.89),
      [2625.2, 1909.8],
      surveyToPage(86466.527, 76024.49),
    ]
    targets.forEach(([x, y]) => {
      let best = Infinity
      for (let i = 0; i < PARCEL_PAGE.length; i += 1) {
        const [ax, ay] = PARCEL_PAGE[i]
        const [bx, by] = PARCEL_PAGE[(i + 1) % PARCEL_PAGE.length]
        const vx = bx - ax
        const vy = by - ay
        const len2 = vx * vx + vy * vy || 1
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2))
        best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t))
      }
      expect(best / PT_PER_M).toBeLessThan(3)
    })
  })

  it('规划路、月明路和东侧路都有路面，斑马线成组', () => {
    const roads = roadRibbons()
    expect(roads).toHaveLength(4)
    expect(roads[0].halfWidth).toBeGreaterThan(4)
    expect(zebraStripes().length).toBe(24)
  })
})
