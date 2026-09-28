import { pageRingToWorld, plazaPage, podiumFrontPage, podiumPage } from './plan'
import { EAST_CANTILEVER_M, EAST_ROOF_M, FOOTPRINT, PODIUM_HEIGHT_M } from './siteGeometry'

export { EAST_CANTILEVER_M, EAST_ROOF_M, PODIUM_HEIGHT_M }

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

function eastBody(x0: number, x1: number, zNorth: number, zSouth: number, bulge: number): Array<[number, number]> {
  const steps = 20
  const points: Array<[number, number]> = [
    [x0, zNorth],
    [x1, zNorth],
  ]
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps
    const x = x1 + (x0 - x1) * u
    points.push([x, zSouth + Math.sin(Math.PI * u) * bulge])
  }
  return points
}

/** 下部玻璃层顶，也是外挑实墙的底。 */
export const EAST_LOWER_TOP_M = 6 + 4.2

/** 上部南侧弧面向外悬挑；两端仍落在外墙角上。 */
export function eastUpperOutline(): Array<[number, number]> {
  return eastBody(FOOTPRINT.minX, FOOTPRINT.maxX, FOOTPRINT.minZ, FOOTPRINT.maxZ, EAST_CANTILEVER_M)
}

/**
 * 8F 东墙外侧挂载点。外表面是上部实墙（下层内退 1.2 m，不在这个平面上）。
 * 从东侧朝墙看，原点在左下角；局部 +Y 向上，+Z 朝东（墙外），+X 沿墙朝北。
 */
export function eastGrilleMount(): {
  length: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
} {
  return {
    length: FOOTPRINT.maxZ - FOOTPRINT.minZ,
    height: EAST_ROOF_M - EAST_LOWER_TOP_M,
    position: [FOOTPRINT.maxX, EAST_LOWER_TOP_M, FOOTPRINT.maxZ],
    rotation: [0, Math.PI / 2, 0],
  }
}

/** 下部平面内退，南侧收进，让出上部悬挑。 */
export function eastLowerOutline(): Array<[number, number]> {
  return eastBody(
    FOOTPRINT.minX + 1.4,
    FOOTPRINT.maxX - 1.2,
    FOOTPRINT.minZ + 1.6,
    FOOTPRINT.maxZ - 1.5,
    1.2,
  )
}

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
