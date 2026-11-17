import { EAST_GRILLE_BOTTOM_M } from '../data/levels'
import {
  EAST_FACE_X,
  EAST_NORTH_Z,
  EAST_SOUTH_WALL_Z,
  EAST_WALL_LENGTH_M,
} from './shell/rings'

/**
 * T140：东立面分层。高度取自已入库 east-grille-v4 的 D076 标高，
 * 不新编楼层平面。上段密肋晚于 __twinReady + 首帧 + 本窗口才挂，
 * 不进 hardGate / balancedFx。lo 格栅仍按 T136 首屏懒策略。
 */
export const EAST_FACADE_BANDS_AFTER_FIRST_MS = 2600

/** 中段玻璃带下沿（D076 SILL_TOP）。 */
export const EAST_FACADE_MID_BOTTOM_M = 19.9
/** 中段玻璃带上沿（D076 GLASS_TOP）。 */
export const EAST_FACADE_MID_TOP_M = 28.7
/** 上段竖肋下沿（D076 FIN_BOTTOM）。 */
export const EAST_FACADE_FIN_BOTTOM_M = 29.1
/** 上段竖肋上沿（D076 CAP_BOTTOM）。 */
export const EAST_FACADE_CAP_BOTTOM_M = 45.2

/** 上段竖肋间距。严于 lo 格栅约 2.69 m 开间，让东向能读出密肋。 */
export const EAST_FACADE_FIN_SPACING_M = 1
export const EAST_FACADE_FIN_DEPTH_M = 0.42

/** 丢掉格栅 GLB 贴墙薄片（玻璃和上段背板）的世界 X 阈值。 */
export const EAST_GRILLE_SHEET_MAX_X = EAST_FACE_X + 0.08

export function eastFacadeLine(): Array<[number, number]> {
  return [
    [EAST_FACE_X, EAST_SOUTH_WALL_Z],
    [EAST_FACE_X, EAST_NORTH_Z],
  ]
}

/** 墙体内侧一点，供 FinRow 把法线指向东（+X）。 */
export function eastFacadeInward(): [number, number] {
  return [EAST_FACE_X - 10, (EAST_NORTH_Z + EAST_SOUTH_WALL_Z) / 2]
}

export type EastFacadeBox = {
  position: [number, number, number]
  size: [number, number, number]
}

/**
 * 东立面分层盒子：中段玻璃略退，上段玻璃贴外皮，中间 0.4 m 横梁来自 D076 BEAM_H。
 * 分层靠几何高低差和横梁，不靠实时阴影。
 */
export function eastFacadeBandPoses(): {
  mid: EastFacadeBox
  upper: EastFacadeBox
  beam: EastFacadeBox
  sill: EastFacadeBox
} {
  const z = (EAST_NORTH_Z + EAST_SOUTH_WALL_Z) / 2
  const len = EAST_WALL_LENGTH_M
  const midX = EAST_FACE_X - 0.55
  const upperX = EAST_FACE_X - 0.12
  const frameX = (midX + upperX) / 2
  const frameDepth = Math.abs(upperX - midX) + 0.08
  return {
    mid: {
      position: [midX, (EAST_FACADE_MID_BOTTOM_M + EAST_FACADE_MID_TOP_M) / 2, z],
      size: [0.05, EAST_FACADE_MID_TOP_M - EAST_FACADE_MID_BOTTOM_M, len],
    },
    upper: {
      position: [upperX, (EAST_FACADE_FIN_BOTTOM_M + EAST_FACADE_CAP_BOTTOM_M) / 2, z],
      size: [0.05, EAST_FACADE_CAP_BOTTOM_M - EAST_FACADE_FIN_BOTTOM_M, len],
    },
    beam: {
      position: [frameX, (EAST_FACADE_MID_TOP_M + EAST_FACADE_FIN_BOTTOM_M) / 2, z],
      size: [frameDepth, EAST_FACADE_FIN_BOTTOM_M - EAST_FACADE_MID_TOP_M, len],
    },
    sill: {
      position: [frameX, (EAST_GRILLE_BOTTOM_M + EAST_FACADE_MID_BOTTOM_M) / 2, z],
      size: [frameDepth, EAST_FACADE_MID_BOTTOM_M - EAST_GRILLE_BOTTOM_M, len],
    },
  }
}

export function eastFacadeBandsChunkDue(
  firstFrameAt: number | null | undefined,
  now: number,
): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= EAST_FACADE_BANDS_AFTER_FIRST_MS
}

export function eastFacadeBandsDueLatched(
  latched: boolean,
  ready: boolean,
  firstFrameAt: number | null | undefined,
  now: number,
): boolean {
  if (latched) return true
  if (!ready) return false
  return eastFacadeBandsChunkDue(firstFrameAt, now)
}
