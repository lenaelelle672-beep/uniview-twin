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
 * 东墙外轮廓细线，取自 site.svg 那条连续折线（stroke 经过页面变换后）。
 * 南段 x=2451.121，北段 x=2474.281，错台 y=1445.121。
 * 间距 23.160 pt / 8.306 pt/m = 2.788 m。内部那对 4.90 m 的线不在这条外墙上。
 */
const EAST_SKIN_PAGE = {
  southX: 2451.1210938,
  northX: 2474.28125004,
  jogY: 1445.1210938,
} as const

/** 消防车道靠近楼的那条细线。对侧细线在 y=1784.719，中心距 7.01 m。 */
const FIRE_LANE_NORTH_PAGE_Y = 1726.519531

export interface EastSkin {
  southFaceX: number
  northFaceX: number
  jogZ: number
  /** 北段相对南段向东错出的距离。 */
  offset: number
  /** 南墙（测量点 X=75926.890）到错台的距离。 */
  southLength: number
  northLength: number
  /** 车道北缘。世界 +Z 向南，小于这个值就是在车道以北。 */
  laneNorthZ: number
}

export function eastSkin(): EastSkin {
  const southFaceX = pageToWorld(EAST_SKIN_PAGE.southX, EAST_SKIN_PAGE.jogY)[0]
  const northFaceX = pageToWorld(EAST_SKIN_PAGE.northX, EAST_SKIN_PAGE.jogY)[0]
  const jogZ = pageToWorld(EAST_SKIN_PAGE.southX, EAST_SKIN_PAGE.jogY)[1]
  return {
    southFaceX,
    northFaceX,
    jogZ,
    offset: northFaceX - southFaceX,
    southLength: FOOTPRINT.maxZ - jogZ,
    northLength: jogZ - FOOTPRINT.minZ,
    laneNorthZ: pageToWorld(EAST_SKIN_PAGE.southX, FIRE_LANE_NORTH_PAGE_Y)[1],
  }
}

/** 弧面、首层停在车道北缘以北，留 0.4 m。 */
function bulgeNorthOfLane(zWall: number, requested: number, laneNorthZ: number): number {
  const room = laneNorthZ - zWall - 0.4
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
 * 南墙在测量点 X=75926.890。东墙外皮是细线上的两段：
 * 南段在尺寸线以东，北段再向东错出约 2.79 m。南侧弧面朝前，停在消防车道以北。
 */
export function eastUpperOutline(): Array<[number, number]> {
  const skin = eastSkin()
  const bulge = bulgeNorthOfLane(FOOTPRINT.maxZ, EAST_CANTILEVER_M, skin.laneNorthZ)
  return withSouthCurve(
    [
      [FOOTPRINT.minX, FOOTPRINT.minZ],
      [skin.northFaceX, FOOTPRINT.minZ],
      [skin.northFaceX, skin.jogZ],
      [skin.southFaceX, skin.jogZ],
      [skin.southFaceX, FOOTPRINT.maxZ],
    ],
    FOOTPRINT.maxZ,
    bulge,
  )
}

/** 底层平面内退，南侧再收进，让出上部悬挑和弧面。东墙错台保留。 */
export function eastLowerOutline(): Array<[number, number]> {
  const skin = eastSkin()
  const zSouth = FOOTPRINT.maxZ - 1.5
  const bulge = bulgeNorthOfLane(zSouth, 1.2, skin.laneNorthZ)
  return withSouthCurve(
    [
      [FOOTPRINT.minX + 1.4, FOOTPRINT.minZ + 1.6],
      [skin.northFaceX - 1.2, FOOTPRINT.minZ + 1.6],
      [skin.northFaceX - 1.2, skin.jogZ],
      [skin.southFaceX - 1.2, skin.jogZ],
      [skin.southFaceX - 1.2, zSouth],
    ],
    zSouth,
    bulge,
  )
}

export interface EastGrilleMount {
  name: 'eastGrilleMountS' | 'eastGrilleMountN'
  length: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
}

/**
 * 东墙两段各一个挂载点。原点在该段外皮南端、标高 ±0.00。
 * 局部 +X 沿墙向北，+Z 朝东，+Y 向上。不挂格栅。
 */
export function eastGrilleMounts(): EastGrilleMount[] {
  const skin = eastSkin()
  const rotation: [number, number, number] = [0, Math.PI / 2, 0]
  return [
    {
      name: 'eastGrilleMountS',
      length: skin.southLength,
      height: EAST_ROOF_M,
      position: [skin.southFaceX, 0, FOOTPRINT.maxZ],
      rotation,
    },
    {
      name: 'eastGrilleMountN',
      length: skin.northLength,
      height: EAST_ROOF_M,
      position: [skin.northFaceX, 0, skin.jogZ],
      rotation,
    },
  ]
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
