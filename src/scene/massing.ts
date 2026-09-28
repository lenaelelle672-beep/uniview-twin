import { pageRingToWorld, plazaPage, podiumFrontPage, podiumPage } from './plan'
import { pageToWorld } from './scale'
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

/**
 * 8F 闭合外轮廓的东墙外皮细线（site.svg 页面 x）。
 * 一条直墙，从北端 y=839.000 贯通到南端 y=1693.160。
 * 再往东 2.788 m、并一直伸到 8F 以北的是地下室粗墙，不用。
 */
const EAST_SKIN_PAGE_X = 2451.1210938

/** 消防车道靠近楼的那条细线。对侧细线在 y=1784.719，宽度 7.01 m。 */
const FIRE_LANE_NORTH_PAGE_Y = 1726.519531

/** 弧面和首层离车道北缘至少留这么多。 */
const LANE_CLEARANCE_M = 4

export interface EastWall {
  /** 外皮细线的世界 x。 */
  faceX: number
  /** 南北向墙长。 */
  length: number
  /** 南墙角点到角点，西测量点到外皮细线。 */
  southLength: number
  /** 车道北缘。世界 +Z 向南。 */
  laneNorthZ: number
}

export function eastWall(): EastWall {
  const faceX = pageToWorld(EAST_SKIN_PAGE_X, FIRE_LANE_NORTH_PAGE_Y)[0]
  return {
    faceX,
    length: FOOTPRINT.maxZ - FOOTPRINT.minZ,
    southLength: faceX - FOOTPRINT.minX,
    laneNorthZ: pageToWorld(EAST_SKIN_PAGE_X, FIRE_LANE_NORTH_PAGE_Y)[1],
  }
}

/** 弧面停在车道北缘以北至少 4 m。 */
function bulgeClearOfLane(zWall: number, requested: number, laneNorthZ: number): number {
  const room = laneNorthZ - zWall - LANE_CLEARANCE_M
  return Math.min(requested, Math.max(0, room))
}

function withSouthCurve(
  eastRun: Array<[number, number]>,
  zSouth: number,
  bulge: number,
): Array<[number, number]> {
  const steps = 20
  const westX = eastRun[0][0]
  const eastX = eastRun[eastRun.length - 1][0]
  const points = eastRun.slice()
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps
    const x = eastX + (westX - eastX) * u
    points.push([x, zSouth + Math.sin(Math.PI * u) * bulge])
  }
  return points
}

/** 下部玻璃层顶。底层内退，上部从这里开始悬挑。 */
export const EAST_LOWER_TOP_M = 6 + 4.2

/**
 * 南墙在测量点 X=75926.890。东墙是外皮细线上的一条直墙。
 * 南侧弧面朝前，最南点离消防车道北缘至少 4 m。
 */
export function eastUpperOutline(): Array<[number, number]> {
  const wall = eastWall()
  const bulge = bulgeClearOfLane(FOOTPRINT.maxZ, EAST_CANTILEVER_M, wall.laneNorthZ)
  return withSouthCurve(
    [
      [FOOTPRINT.minX, FOOTPRINT.minZ],
      [wall.faceX, FOOTPRINT.minZ],
      [wall.faceX, FOOTPRINT.maxZ],
    ],
    FOOTPRINT.maxZ,
    bulge,
  )
}

/** 底层平面内退，南侧再收进，让出上部悬挑和弧面。东墙仍是一条直墙。 */
export function eastLowerOutline(): Array<[number, number]> {
  const wall = eastWall()
  const zSouth = FOOTPRINT.maxZ - 1.5
  const bulge = bulgeClearOfLane(zSouth, 1.2, wall.laneNorthZ)
  return withSouthCurve(
    [
      [FOOTPRINT.minX + 1.4, FOOTPRINT.minZ + 1.6],
      [wall.faceX - 1.2, FOOTPRINT.minZ + 1.6],
      [wall.faceX - 1.2, zSouth],
    ],
    zSouth,
    bulge,
  )
}

export interface EastGrilleMount {
  length: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
}

/**
 * 东墙外皮挂载点。原点在外皮南端、标高 ±0.00。
 * 局部 +X 沿墙向北，+Z 朝东，+Y 向上。不挂格栅。
 */
export function eastGrilleMount(): EastGrilleMount {
  const wall = eastWall()
  return {
    length: wall.length,
    height: EAST_ROOF_M,
    position: [wall.faceX, 0, FOOTPRINT.maxZ],
    rotation: [0, Math.PI / 2, 0],
  }
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
