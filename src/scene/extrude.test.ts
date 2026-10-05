import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { extrudeUp } from './extrude'
import { createRingBand } from './shell/facade'
import { courtyardHole, eastGrilleMount, eastLowerOutline, eastUpperOutline, eastWall, podiumOutline } from './massing'
import { EAST_ROOF_M } from './siteGeometry'
import { TOWER_OUTLINE_OVERVIEW } from './shell/rings'

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
    const podium = extrudeUp(podiumOutline(), 17.65)
    const court = extrudeUp(courtyardHole(), 5.5)
    const upper = extrudeUp(eastUpperOutline(), EAST_ROOF_M)
    const lower = extrudeUp(eastLowerOutline(), 19.6)
    for (const geometry of [podium, court, upper, lower]) {
      geometry.computeBoundingBox()
      expect(geometry.boundingBox?.max.y).toBeGreaterThan(1)
      expect(Number.isFinite(geometry.boundingBox?.min.x)).toBe(true)
    }
    expect(upper.boundingBox?.max.y).toBeCloseTo(EAST_ROOF_M, 4)
    expect(upper.boundingBox?.max.x ?? 0).toBeGreaterThan(lower.boundingBox?.max.x ?? 0)
    for (const geometry of [podium, court, upper, lower]) geometry.dispose()
  })

  it('8F 东墙 102.26 m、南墙 59.06 m 直墙，格栅挂在南端', () => {
    const wall = eastWall()
    const upper = eastUpperOutline()
    const eastXs = upper.filter(([x]) => x > 98.5).map(([x]) => x)
    expect(eastXs.length).toBeGreaterThan(1)
    expect(eastXs[0]).toBeCloseTo(eastXs[1], 6)
    expect(eastXs[0]).toBeCloseTo(wall.faceX - 0.6, 3)
    expect(wall.faceX).toBeCloseTo(100.0535, 3)
    expect(wall.length).toBeCloseTo(102.26, 2)
    expect(wall.southLength).toBeCloseTo(59.06, 2)
    expect(wall.southGlassZ).toBeCloseTo(112.09, 3)
    expect(wall.northZ).toBeCloseTo(9.47, 3)
    expect(wall.southWallZ - wall.northZ).toBeCloseTo(102.254, 2)

    const glassZ = upper.filter(([, z]) => z > 111.9).map(([, z]) => z)
    expect(glassZ.every((z) => Math.abs(z - 112.09) < 0.02)).toBe(true)
    expect(wall.laneNorthZ - wall.southGlassZ).toBeGreaterThanOrEqual(3.9 - 1e-6)

    const mount = eastGrilleMount()
    const node = new Object3D()
    node.position.set(...mount.position)
    node.rotation.set(...mount.rotation)
    node.updateMatrixWorld()
    const origin = node.localToWorld(new Vector3())
    const along = node.localToWorld(new Vector3(1, 0, 0)).sub(origin)
    const up = node.localToWorld(new Vector3(0, 1, 0)).sub(origin)
    const outward = node.localToWorld(new Vector3(0, 0, 1)).sub(origin)
    expect(origin.x).toBeCloseTo(100.0535, 4)
    expect(origin.y).toBeCloseTo(0, 6)
    expect(origin.z).toBeCloseTo(111.724, 3)
    expect(mount.length).toBeCloseTo(102.26, 4)
    expect(mount.height).toBeCloseTo(45.5, 4)
    expect(mount.rotation[1]).toBeCloseTo(Math.PI / 2, 6)
    expect(along.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(0, 5), expect.closeTo(-1, 5)])
    expect(up.toArray()).toEqual([expect.closeTo(0, 5), expect.closeTo(1, 5), expect.closeTo(0, 5)])
    expect(outward.toArray()).toEqual([expect.closeTo(1, 5), expect.closeTo(0, 5), expect.closeTo(0, 5)])
  })

  it('去掉底面后顶面和侧面还在', () => {
    const both = extrudeUp(
      [
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ],
      3,
    )
    const top = extrudeUp(
      [
        [0, 0],
        [10, 0],
        [10, 4],
        [0, 4],
      ],
      3,
      [],
      'top',
    )
    const count = (geometry: { getIndex: () => { count: number } | null; getAttribute: (name: string) => { count: number } }) =>
      (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3
    expect(count(both)).toBeGreaterThan(count(top))
    both.dispose()
    top.dispose()
  })

  it('楼层条只留外露面，总览轮廓每边两三角', () => {
    const band = createRingBand(TOWER_OUTLINE_OVERVIEW, 1, 0.78)
    const tris = (band.getIndex()?.count ?? band.getAttribute('position').count) / 3
    expect(tris).toBeLessThanOrEqual(TOWER_OUTLINE_OVERVIEW.length * 2)
    band.dispose()
  })

  it('塔楼总览轮廓含南弧且每 90° 不超过 16 段', () => {
    expect(TOWER_OUTLINE_OVERVIEW.length).toBeLessThanOrEqual(32)
    const south = TOWER_OUTLINE_OVERVIEW.filter(([, z]) => z > 16)
    expect(south.length).toBeGreaterThan(3)
    expect(south.length).toBeLessThanOrEqual(16)
  })
})
