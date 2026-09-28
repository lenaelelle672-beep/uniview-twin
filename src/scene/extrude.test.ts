import { describe, expect, it } from 'vitest'
import { extrudeUp } from './extrude'
import { courtyardHole, eastLowerOutline, eastUpperOutline, podiumOutline } from './massing'

describe('轮廓挤出', () => {
  it('XZ 矩形挤出后 Y 轴向上，范围与输入一致', () => {
    const geometry = extrudeUp(
      [
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ],
      3,
    )
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    expect(box).not.toBeNull()
    if (!box) return
    expect(box.min.x).toBeCloseTo(0, 4)
    expect(box.max.x).toBeCloseTo(10, 4)
    expect(box.min.y).toBeCloseTo(0, 4)
    expect(box.max.y).toBeCloseTo(3, 4)
    expect(box.min.z).toBeCloseTo(0, 4)
    expect(box.max.z).toBeCloseTo(4, 4)
    geometry.dispose()
  })

  it('裙房、下沉庭院和东楼轮廓可以挤出', () => {
    const podium = extrudeUp(podiumOutline(), 10.2)
    const court = extrudeUp(courtyardHole(), 5.5)
    const upper = extrudeUp(eastUpperOutline(), 12.6)
    const lower = extrudeUp(eastLowerOutline(), 10.2)
    for (const geometry of [podium, court, upper, lower]) {
      geometry.computeBoundingBox()
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1)
      expect(Number.isFinite(geometry.boundingBox?.min.x)).toBe(true)
      geometry.dispose()
    }
    const upperBox = upper.boundingBox
    const lowerBox = lower.boundingBox
    expect(upperBox && lowerBox && upperBox.max.z - lowerBox.max.z).toBeGreaterThan(3)
  })
})
