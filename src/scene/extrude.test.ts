import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { extrudeUp } from './extrude'
import { courtyardHole, eastGrilleMount, eastUpperOutline, podiumOutline } from './massing'
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
    const east = extrudeUp(eastUpperOutline(), EAST_ROOF_M)
    for (const geometry of [podium, court, east]) {
      geometry.computeBoundingBox()
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1)
      expect(Number.isFinite(geometry.boundingBox?.min.x)).toBe(true)
      geometry.dispose()
    }
    expect(east.boundingBox?.max.y).toBeCloseTo(EAST_ROOF_M, 4)
  })

  it('东墙是直墙，挂载点在外皮南端标高 0，+X 向北、+Z 朝东', () => {
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
    expect(origin.y).toBeCloseTo(0, 6)
    expect(origin.z).toBeCloseTo(FOOTPRINT.maxZ, 6)
    expect(mount.length).toBeCloseTo(97.4, 1)
    expect(mount.height).toBeCloseTo(45.5, 4)
    expect(FOOTPRINT.maxX - FOOTPRINT.minX).toBeCloseTo(51.9, 1)
    expect(along.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(0, 5), expect.closeTo(-1, 5)])
    expect(up.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(1, 5), expect.closeTo(0, 5)])
    expect(outward.toArray()).toEqual([expect.closeTo(1, 5), expect.closeTo(0, 5), expect.closeTo(0, 5)])
  })
})
