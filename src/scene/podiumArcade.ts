import { MeshStandardMaterial } from 'three'
import { finsAlong, podiumFocus, podiumFrontArc, podiumOutline, type FinPoint } from './massing'

/** 下层架空净高。须明显低于裙房通高，给上段 T144 密肋留出可读高度。 */
export const PODIUM_ARCADE_HEIGHT_M = 5.8
/** 下层玻璃相对原外弧向内退后，总览 / p2f003 能读出挑檐下的长廊。 */
export const PODIUM_ARCADE_RECESS_M = 3.6
/** 沿弧廊的柱距。宽于密肋，对照实拍是疏柱而不是第二排密肋。 */
export const PODIUM_ARCADE_COLUMN_SPACING_M = 7.2
export const PODIUM_ARCADE_COLUMN_W_M = 0.8
export const PODIUM_ARCADE_COLUMN_DEPTH_M = 0.8
/** 柱中心从原外弧向内收，落在上段挑檐下。 */
export const PODIUM_ARCADE_COLUMN_INSET_M = 0.55
export const PODIUM_ARCADE_GLASS_T_M = 0.18

/** 弧廊柱专用浅石材，不改共享 stoneMaterial。 */
export const podiumArcadeColumnMaterial = new MeshStandardMaterial({
  name: '裙房弧廊柱',
  color: '#c8c3ba',
  roughness: 0.78,
  metalness: 0.04,
  envMapIntensity: 0.18,
})

function onFrontArc(x: number, z: number, arc: Array<[number, number]>, eps = 0.08): boolean {
  return arc.some(([ax, az]) => Math.hypot(x - ax, z - az) <= eps)
}

function insetTowardFocus(x: number, z: number, amount: number, focus: [number, number]): [number, number] {
  const dx = x - focus[0]
  const dz = z - focus[1]
  const len = Math.hypot(dx, dz) || 1
  return [x - (dx / len) * amount, z - (dz / len) * amount]
}

/** 下层体量：只把朝向广场的凹弧退后，其余外皮不动。 */
export function podiumLowerOutline(recess = PODIUM_ARCADE_RECESS_M): Array<[number, number]> {
  const outline = podiumOutline()
  const arc = podiumFrontArc()
  const focus = podiumFocus()
  return outline.map(([x, z]) => (onFrontArc(x, z, arc) ? insetTowardFocus(x, z, recess, focus) : [x, z]))
}

/** 退后玻璃长廊的薄墙轮廓（沿弧一条带宽）。 */
export function podiumArcadeGlassOutline(recess = PODIUM_ARCADE_RECESS_M): Array<[number, number]> {
  const arc = podiumFrontArc()
  const focus = podiumFocus()
  const front = arc.map(([x, z]) => insetTowardFocus(x, z, recess - 0.04, focus))
  const back = arc.map(([x, z]) => insetTowardFocus(x, z, recess + PODIUM_ARCADE_GLASS_T_M, focus))
  return [...front, ...back.slice().reverse()]
}

/** 沿原外弧布柱，中心向内收到挑檐下。 */
export function podiumArcadeColumns(): FinPoint[] {
  return finsAlong(podiumFrontArc(), PODIUM_ARCADE_COLUMN_SPACING_M, podiumFocus(), -PODIUM_ARCADE_COLUMN_INSET_M)
}
