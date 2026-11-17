/**
 * T134：裙房白铝檐口、屋顶绿化和下沉庭院可读性。
 * 檐口加宽写在已有 Podium 里（只改数字，不新开材质栈）。
 * 屋顶草、南侧加建檐口、台阶、圈沿与盆底绿化走这条晚加载入口，
 * 过同一道 2600ms 窗口才请求，不进 hardGate / balancedFx。
 * 不重开 T100，不下屋顶瓦，不铺近场路网和南侧圆形大草坪（T138）。
 */

export const PODIUM_COURT_AFTER_FIRST_MS = 2600

/** 与 Podium.tsx 檐口带 outset 一致。原 0.16 m，加宽后总览能读成一圈白铝板。 */
export const EAVE_OUTSET_M = 1
/** 与 Podium.tsx 檐口挤出高度一致。原 0.42 m。 */
export const EAVE_HEIGHT_M = 1.5
/** 与 Podium.tsx 檐口 position.y = PODIUM_HEIGHT_M - 此值一致。原 0.45 m。 */
export const EAVE_BELOW_ROOF_M = 1

export const ROOF_GRASS_INSET_M = 0.45
export const ROOF_GRASS_THICKNESS_M = 0.1

export const COURT_CURB_WIDTH_M = 0.4
export const COURT_CURB_HEIGHT_M = 0.32
export const COURT_CURB_Y_M = 0.12
export const COURT_STEP_COUNT = 5
export const COURT_STEP_TREAD_M = 1.7
/** 与 makeBasin 顶圈、场地标高对齐的第一步踏面。 */
export const COURT_STEP_TOP_Y_M = 0.12
export const COURT_PLANT_LIFT_M = 0.05
export const COURT_PLANT_MARGIN_M = 0.3

export const COURT_DEPTH_M = 5.5

export function ringCentroid(points: Array<[number, number]>): [number, number] {
  const n = points.length || 1
  return [
    points.reduce((sum, [x]) => sum + x, 0) / n,
    points.reduce((sum, [, z]) => sum + z, 0) / n,
  ]
}

/** amount>0 时沿离开 from 的反方向收，得到更窄的一圈。 */
export function offsetToward(
  points: Array<[number, number]>,
  amount: number,
  from: [number, number],
): Array<[number, number]> {
  return points.map(([x, z]) => {
    const dx = x - from[0]
    const dz = z - from[1]
    const len = Math.hypot(dx, dz) || 1
    return [x - (dx / len) * amount, z - (dz / len) * amount]
  })
}

export function eaveTopY(podiumHeightM: number): number {
  return podiumHeightM - EAVE_BELOW_ROOF_M + EAVE_HEIGHT_M
}

export function eaveBottomY(podiumHeightM: number): number {
  return podiumHeightM - EAVE_BELOW_ROOF_M
}

/** 翅片顶：y = H/2、height = H*0.92 → H * 0.96。檐口下沿须压住它。 */
export function finTopY(podiumHeightM: number): number {
  return podiumHeightM * 0.96
}

export function courtStepRiseM(): number {
  return (COURT_STEP_TOP_Y_M + COURT_DEPTH_M) / COURT_STEP_COUNT
}

export function courtStepInset(index: number): number {
  return COURT_CURB_WIDTH_M / 2 + index * COURT_STEP_TREAD_M
}

export function podiumCourtChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= PODIUM_COURT_AFTER_FIRST_MS
}

export function podiumCourtDueLatched(
  latched: boolean,
  firstFrameAt: number | null | undefined,
  now: number,
): boolean {
  return latched || podiumCourtChunkDue(firstFrameAt, now)
}
