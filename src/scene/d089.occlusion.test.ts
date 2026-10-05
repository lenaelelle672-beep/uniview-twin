import { describe, expect, it } from 'vitest'
import { Box3, Mesh, Raycaster, Vector3 } from 'three'
import { CAMERA_POSES } from './cameras'
import { extrudeUp } from './extrude'
import {
  CURVED_RND_ROOF_M,
  EAST_GRILLE_BOTTOM_M,
  EAST_PARAPET_TOP_M,
  towerRow,
} from '../data/levels'
import { eastUpperOutline, eastWall, podiumOutline } from './massing'
import { eastBlockOutline } from './shell/rings'
import { ARC_CENTER_PAGE, podiumFrontPage } from './plan'
import { pageToWorld } from './scale'

function ringBounds(ring: Array<[number, number]>) {
  const xs = ring.map(([x]) => x)
  const zs = ring.map(([, z]) => z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

describe('D089 east 机位与弧形裙房', () => {
  it('8F 体块平面、标高与任务单/levels 常量一致', () => {
    const wall = eastWall()
    expect(wall.faceX).toBeCloseTo(100.0535, 4)
    expect(wall.northZ).toBeCloseTo(9.47, 3)
    expect(wall.southWallZ).toBeCloseTo(111.724, 3)
    expect(wall.length).toBeCloseTo(102.26, 2)
    expect(wall.southLength).toBeCloseTo(59.06, 2)
    expect(wall.southGlassZ).toBeCloseTo(112.09, 3)
    expect(towerRow('F8').level_m).toBeCloseTo(35.65, 5)
    expect(EAST_PARAPET_TOP_M).toBeCloseTo(45.3, 5)
    expect(EAST_GRILLE_BOTTOM_M).toBeCloseTo(19.6, 5)
    const box = ringBounds(eastBlockOutline())
    expect(box.maxX).toBeCloseTo(100.0535, 4)
    expect(box.maxZ).toBeCloseTo(112.09, 3)
    expect(box.minZ).toBeCloseTo(9.47, 3)
  })

  it('弧形研发中心半径、圆心和屋面 17.650 与 site.pdf / levels 一致', () => {
    expect(CURVED_RND_ROOF_M).toBeCloseTo(17.65, 5)
    const center = pageToWorld(ARC_CENTER_PAGE[0], ARC_CENTER_PAGE[1])
    const front = podiumFrontPage().map(([x, y]) => pageToWorld(x, y))
    const radii = front.map(([x, z]) => Math.hypot(x - center[0], z - center[1]))
    expect(Math.min(...radii)).toBeCloseTo(45.71, 1)
    expect(Math.max(...radii)).toBeCloseTo(45.71, 1)
    const podium = ringBounds(podiumOutline())
    expect(podium.maxX).toBeLessThan(eastWall().faceX - 1)
  })

  it('east 相机到弧形裙房屋面的射线被 8F 上层网格挡住', () => {
    const pose = CAMERA_POSES.east
    expect(pose.position).toEqual([290, 45, 60])
    expect(pose.target).toEqual([103, 45, 60])
    expect(pose.fov).toBe(60)

    const upper = extrudeUp(eastUpperOutline(), EAST_PARAPET_TOP_M - EAST_GRILLE_BOTTOM_M)
    upper.translate(0, EAST_GRILLE_BOTTOM_M, 0)
    const eastMesh = new Mesh(upper)
    eastMesh.name = 'EastBlockUpper'
    eastMesh.updateMatrixWorld()

    const podium = extrudeUp(podiumOutline(), CURVED_RND_ROOF_M)
    const podiumMesh = new Mesh(podium)
    podiumMesh.name = 'Podium'
    podiumMesh.updateMatrixWorld()

    const podiumBox = new Box3().setFromObject(podiumMesh)
    const samples: Array<[number, number, number]> = [
      [(podiumBox.min.x + podiumBox.max.x) / 2, CURVED_RND_ROOF_M, (podiumBox.min.z + podiumBox.max.z) / 2],
      [podiumBox.min.x + 8, CURVED_RND_ROOF_M, (podiumBox.min.z + podiumBox.max.z) / 2],
      [(podiumBox.min.x + podiumBox.max.x) / 2, CURVED_RND_ROOF_M, podiumBox.max.z - 4],
      [20, CURVED_RND_ROOF_M, 40],
    ]

    const origin = new Vector3(...pose.position)
    const hits = samples.map((point) => {
      const target = new Vector3(...point)
      const direction = target.clone().sub(origin).normalize()
      const raycaster = new Raycaster(origin, direction, 0, origin.distanceTo(target) + 0.5)
      const found = raycaster.intersectObjects([eastMesh, podiumMesh], false)
      const first = found[0]
      return {
        point,
        first: first?.object.name ?? null,
        distance: first?.distance ?? null,
        blockedByEast: first?.object.name === 'EastBlockUpper',
      }
    })

    expect(hits.some((hit) => hit.blockedByEast)).toBe(true)
    const blocked = hits.filter((hit) => hit.blockedByEast)
    expect(blocked.length).toBeGreaterThan(0)
    upper.dispose()
    podium.dispose()
  })
})
