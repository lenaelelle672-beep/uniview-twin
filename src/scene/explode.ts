import { easing } from 'maath'

/** B1 + F1～F22。 */
export const FLOOR_COUNT = 23

/**
 * 展开后相邻两层外壳之间的净空（米）。
 * 只加在每层 group 的 position.y 上，不改楼层高度，所以净空就是这一常量乘进度。
 */
export const EXPLODE_GAP_M = 8

/**
 * B1 标高 -5.5 m，楼板在地面以下。展开时整栋再抬高这么多，
 * B1 升到地面以上，23 层都能看见。层间净空仍是 EXPLODE_GAP_M。
 */
export const EXPLODE_GROUND_CLEARANCE_M = 6

/** 拉开和收拢都走这一段时长。结束时进度精确落到 0 或 1。 */
export const EXPLODE_DURATION_S = 0.8

/**
 * 第 index 层（0 = B1，22 = F22）在进度 progress（0 收拢，1 展开）下的 Y 偏移。
 * progress 为 0 时每层都是 0，位置与未爆炸时完全一致。
 */
export function explodeOffset(index: number, progress: number): number {
  if (index < 0 || index >= FLOOR_COUNT) {
    throw new Error(`楼层序号超出 0～${FLOOR_COUNT - 1}：${index}`)
  }
  return (EXPLODE_GROUND_CLEARANCE_M + index * EXPLODE_GAP_M) * progress
}

/** 该层外壳在世界坐标里的底面和顶面。底面 = 标高 + 偏移。 */
export function floorWorldSpan(elevation: number, height: number, index: number, progress: number) {
  const bottom = elevation + explodeOffset(index, progress)
  return { bottom, top: bottom + height }
}

/**
 * 从 from 走向 to。elapsed 用秒。
 * 曲线是 maath cubic.out；满 0.8 秒后返回精确的 to，收拢结束时偏移可以回到 0。
 */
export function explodeProgress(from: number, to: number, elapsed: number): number {
  if (elapsed <= 0) return from
  if (elapsed >= EXPLODE_DURATION_S) return to
  const shaped = easing.cubic.out(elapsed / EXPLODE_DURATION_S)
  return from + (to - from) * shaped
}
