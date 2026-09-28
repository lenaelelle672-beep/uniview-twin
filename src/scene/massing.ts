import { COURTYARD, EAST_CANTILEVER_M, EAST_ROOF_M, FOOTPRINT, PODIUM_HEIGHT_M, TOWER } from './siteGeometry'

export { EAST_CANTILEVER_M, EAST_ROOF_M, PODIUM_HEIGHT_M }

export function ellipsePoints(
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  segments = 36,
): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2
    points.push([cx + Math.cos(t) * rx, cz + Math.sin(t) * rz])
  }
  return points
}

export function courtyardHole(): Array<[number, number]> {
  return ellipsePoints(COURTYARD.cx, COURTYARD.cz, COURTYARD.rx, COURTYARD.rz, 40)
}

/** 裙房外弧：从西南绕到东南，包住塔楼南立面，不盖住东楼。 */
export function podiumOuterArc(): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const steps = 32
  const a0 = Math.PI * 0.9
  const a1 = Math.PI * 0.1
  for (let i = 0; i <= steps; i += 1) {
    const t = a0 + ((a1 - a0) * i) / steps
    points.push([Math.cos(t) * 34, 14 + Math.sin(t) * 22])
  }
  return points
}

export function podiumOutline(): Array<[number, number]> {
  const arc = podiumOuterArc()
  const east = arc[arc.length - 1]
  const west = arc[0]
  return [
    ...arc,
    [Math.min(east[0], TOWER.maxX - 2), TOWER.maxZ - 0.15],
    [Math.max(west[0], TOWER.minX + 2), TOWER.maxZ - 0.15],
  ]
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

export function eastUpperOutline(): Array<[number, number]> {
  return eastBody(22, FOOTPRINT.maxX, FOOTPRINT.minZ + 1.5, 30, 7)
}

export function eastLowerOutline(): Array<[number, number]> {
  return eastBody(24.2, FOOTPRINT.maxX - 2, FOOTPRINT.minZ + 3, 30 - EAST_CANTILEVER_M, 7)
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
