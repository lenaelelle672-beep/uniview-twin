import {
  CURVED_RND_ROOF_M,
  EAST_GRILLE_BOTTOM_M,
  EAST_GRILLE_TOP_M,
  EAST_PARAPET_TOP_M,
  eastFloorBandLevels,
} from '../data/levels'
import { pageRingToWorld, plazaPage, podiumFrontPage, podiumPage } from './plan'
import { pageToWorld } from './scale'
import { EAST_CANTILEVER_M } from './siteGeometry'
import {
  EAST_FACE_X,
  EAST_GRILLE_ROT_Y,
  EAST_NORTH_Z,
  EAST_SOUTH_GLASS_Z,
  EAST_SOUTH_LENGTH_M,
  EAST_SOUTH_WALL_Z,
  EAST_WALL_LENGTH_M,
  eastBlockOutline,
  insetRing,
} from './shell/rings'

export { EAST_CANTILEVER_M }
export const EAST_ROOF_M = EAST_PARAPET_TOP_M
export const PODIUM_HEIGHT_M = CURVED_RND_ROOF_M
export const EAST_LOWER_TOP_M = EAST_GRILLE_BOTTOM_M

export function courtyardHole(): Array<[number, number]> {
  return pageRingToWorld(plazaPage())
}

/** 裙楼朝向广场的凹弧，fins 沿这条外墙。 */
export function podiumFrontArc(): Array<[number, number]> {
  return pageRingToWorld(podiumFrontPage())
}

export function podiumOutline(): Array<[number, number]> {
  return pageRingToWorld(podiumPage())
}

export function podiumFocus(): [number, number] {
  const points = podiumOutline()
  const sx = points.reduce((sum, [x]) => sum + x, 0)
  const sz = points.reduce((sum, [, z]) => sum + z, 0)
  return [sx / points.length, sz / points.length]
}

/** 消防车道靠近楼的那条细线。对侧细线在 y=1784.719，宽度 7.01 m。 */
const FIRE_LANE_NORTH_PAGE_Y = 1726.519531
const EAST_SKIN_PAGE_X = 2451.1210938

export interface EastWall {
  /** 外皮细线的世界 x。 */
  faceX: number
  /** 南北向墙长。 */
  length: number
  /** 南墙玻璃线长度。 */
  southLength: number
  /** 车道北缘。世界 +Z 向南。 */
  laneNorthZ: number
  northZ: number
  southWallZ: number
  southGlassZ: number
}

export function eastWall(): EastWall {
  return {
    faceX: EAST_FACE_X,
    length: EAST_WALL_LENGTH_M,
    southLength: EAST_SOUTH_LENGTH_M,
    laneNorthZ: pageToWorld(EAST_SKIN_PAGE_X, FIRE_LANE_NORTH_PAGE_Y)[1],
    northZ: EAST_NORTH_Z,
    southWallZ: EAST_SOUTH_WALL_Z,
    southGlassZ: EAST_SOUTH_GLASS_Z,
  }
}

/** 上层东缘内收，把外皮让给格栅，不平移挂点。 */
export const EAST_UPPER_EAST_INSET_M = 0.6

export function eastUpperOutline(): Array<[number, number]> {
  return eastBlockOutline().map(([x, z]) =>
    x > EAST_FACE_X - 0.25 ? [x - EAST_UPPER_EAST_INSET_M, z] : [x, z],
  )
}

/** 19.6 m 以下缩进的裙房。东、南各退约 1.2 m，给格栅让出外皮。 */
export function eastLowerOutline(): Array<[number, number]> {
  return insetRing(eastBlockOutline(), 1.2)
}

export interface EastGrilleMount {
  length: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
}

/**
 * 格栅 v4 挂点。原点在外皮南端、标高 ±0.00。
 * 局部 +X 沿墙向北，+Z 朝东，+Y 向上。按挂点放，不按包围盒。
 */
export function eastGrilleMount(): EastGrilleMount {
  return {
    length: EAST_WALL_LENGTH_M,
    height: EAST_GRILLE_TOP_M,
    position: [EAST_FACE_X, 0, EAST_SOUTH_WALL_Z],
    rotation: [0, EAST_GRILLE_ROT_Y, 0],
  }
}

/** 6F～8F 西面弧墙，给翅片用。 */
export function eastWestArc(): Array<[number, number]> {
  return eastBlockOutline().slice(5)
}

export { eastFloorBandLevels }

export interface FinPoint {
  x: number
  z: number
  rotY: number
}

/** 沿折线外侧布垂直 fins。outwardFrom 用来判断法线朝外。 */
export function outset(points: Array<[number, number]>, amount: number, from: [number, number]): Array<[number, number]> {
  return points.map(([x, z]) => {
    const dx = x - from[0]
    const dz = z - from[1]
    const len = Math.hypot(dx, dz) || 1
    return [x + (dx / len) * amount, z + (dz / len) * amount]
  })
}

export function finsAlong(
  points: Array<[number, number]>,
  spacing: number,
  outwardFrom: [number, number],
  stickOut: number,
): FinPoint[] {
  const fins: FinPoint[] = []
  let carried = spacing * 0.5
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const len = Math.hypot(dx, dz)
    if (len < 1e-3) continue
    const tx = dx / len
    const tz = dz / len
    let nx = tz
    let nz = -tx
    const mx = (a[0] + b[0]) / 2
    const mz = (a[1] + b[1]) / 2
    if (nx * (mx - outwardFrom[0]) + nz * (mz - outwardFrom[1]) < 0) {
      nx = -nx
      nz = -nz
    }
    let dist = carried
    while (dist <= len) {
      const x = a[0] + tx * dist
      const z = a[1] + tz * dist
      fins.push({
        x: x + nx * stickOut,
        z: z + nz * stickOut,
        rotY: Math.atan2(nx, nz),
      })
      dist += spacing
    }
    carried = dist - len
  }
  return fins
}
