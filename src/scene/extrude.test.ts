import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { extrudeUp } from './extrude'
import { courtyardHole, eastGrilleMount, eastLowerOutline, eastUpperOutline, EAST_LOWER_TOP_M, podiumOutline } from './massing'
import { EAST_ROOF_M, FOOTPRINT } from './siteGeometry'

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

  it('东墙挂载点在外表面左下角，局部 +Y 向上、+Z 朝外', () => {
    const mount = eastGrilleMount()
    const node = new Object3D()
    node.position.set(...mount.position)
    node.rotation.set(...mount.rotation)
    node.updateMatrixWorld()
    const origin = node.localToWorld(new Vector3())
    const along = node.localToWorld(new Vector3(1, 0, 0)).sub(origin)
    const up = node.localToWorld(new Vector3(0, 1, 0)).sub(origin)
    const outward = node.localToWorld(new Vector3(0, 0, 1)).sub(origin)
    expect(origin.x).toBeCloseTo(FOOTPRINT.maxX, 6)
    expect(origin.y).toBeCloseTo(EAST_LOWER_TOP_M, 6)
    expect(origin.z).toBeCloseTo(FOOTPRINT.maxZ, 6)
    expect(mount.length).toBeCloseTo(FOOTPRINT.maxZ - FOOTPRINT.minZ, 6)
    expect(mount.height).toBeCloseTo(EAST_ROOF_M - EAST_LOWER_TOP_M, 6)
    expect(along.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(0, 5), expect.closeTo(-1, 5)])
    expect(up.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(1, 5), expect.closeTo(0, 5)])
    expect(outward.toArray()).toEqual([expect.closeTo(1, 5), expect.closeTo(0, 5), expect.closeTo(0, 5)])
  })
})
