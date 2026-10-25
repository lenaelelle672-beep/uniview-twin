/**
 * T069：导览轨只画一条，控制点、分段和张力都封顶。
 * 张力只在 curveType 为 catmullrom 时生效；这里用 centripetal，避开尖角。
 * 几何弓高另有 TOUR_BOW_CAP_M，测试会拿 three 的曲线再量一次。
 */

export const TOUR_POINT_CAP = 6
export const TOUR_SEGMENT_CAP = 12
export const TOUR_TENSION_CAP = 0.35
export const TOUR_BOW_CAP_M = 8
export const TOUR_CLEAR_M = 38
export const TOUR_CURVE = 'centripetal' as const

export function cappedSegments(value: number): number {
  if (!Number.isFinite(value)) return TOUR_SEGMENT_CAP
  return Math.min(TOUR_SEGMENT_CAP, Math.max(1, Math.round(value)))
}

export function cappedTension(value: number): number {
  if (!Number.isFinite(value)) return TOUR_TENSION_CAP
  return Math.min(TOUR_TENSION_CAP, Math.max(0, value))
}
