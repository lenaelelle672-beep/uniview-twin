import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { extrudeUp } from './extrude'
import { courtyardHole, eastGrilleMount, eastLowerOutline, eastUpperOutline, eastWall, podiumOutline } from './massing'
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
    const upper = extrudeUp(eastUpperOutline(), EAST_ROOF_M)
    const lower = extrudeUp(eastLowerOutline(), 10.2)
    for (const geometry of [podium, court, upper, lower]) {
      geometry.computeBoundingBox()
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1)
      expect(Number.isFinite(geometry.boundingBox?.min.x)).toBe(true)
    }
    expect(upper.boundingBox?.max.y).toBeCloseTo(EAST_ROOF_M, 4)
    expect((upper.boundingBox?.max.z ?? 0) - (lower.boundingBox?.max.z ?? 0)).toBeGreaterThan(3)
    expect((upper.boundingBox?.max.x ?? 0) - (lower.boundingBox?.max.x ?? 0)).toBeGreaterThan(1)
    for (const geometry of [podium, court, upper, lower]) geometry.dispose()
  })

  it('东墙是外皮细线上的一条直墙，挂载点在南端，弧面离车道北缘至少 4 m', () => {
    const wall = eastWall()
    const upper = eastUpperOutline()
    const eastXs = upper.slice(1, 3).map(([x]) => x)
    expect(eastXs[0]).toBeCloseTo(eastXs[1], 6)
    expect(wall.faceX).toBeCloseTo(eastXs[0], 6)
    expect(wall.faceX).toBeGreaterThan(FOOTPRINT.maxX + 2)
    expect(wall.length).toBeCloseTo(97.4, 1)
    expect(wall.southLength).toBeCloseTo(55.1, 2)
    expect(FOOTPRINT.maxX - FOOTPRINT.minX).toBeCloseTo(51.9, 1)

    const upperZ = Math.max(...upper.map(([, z]) => z))
    const lowerZ = Math.max(...eastLowerOutline().map(([, z]) => z))
    expect(wall.laneNorthZ - upperZ).toBeGreaterThanOrEqual(4 - 1e-6)
    expect(wall.laneNorthZ - lowerZ).toBeGreaterThanOrEqual(4)

    const mount = eastGrilleMount()
    const node = new Object3D()
    node.position.set(...mount.position)
    node.rotation.set(...mount.rotation)
    node.updateMatrixWorld()
    const origin = node.localToWorld(new Vector3())
    const along = node.localToWorld(new Vector3(1, 0, 0)).sub(origin)
    const up = node.localToWorld(new Vector3(0, 1, 0)).sub(origin)
    const outward = node.localToWorld(new Vector3(0, 0, 1)).sub(origin)
    expect(origin.x).toBeCloseTo(wall.faceX, 6)
    expect(origin.y).toBeCloseTo(0, 6)
    expect(origin.z).toBeCloseTo(FOOTPRINT.maxZ, 6)
    expect(mount.length).toBeCloseTo(wall.length, 4)
    expect(mount.height).toBeCloseTo(45.5, 4)
    expect(mount.rotation[1]).toBeCloseTo(Math.PI / 2, 6)
    expect(along.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(0, 5), expect.closeTo(-1, 5)])
    expect(up.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(1, 5), expect.closeTo(0, 5)])
    expect(outward.toArray()).toEqual([expect.closeTo(1, 5), expect.closeTo(0, 5), expect.closeTo(0, 5)])
  })
})
