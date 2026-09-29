import type { CameraId } from '../types'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

/**
 * 固定机位。五个 `?cam=` 在 integration 合入后的体块上按 D028 重新校准：
 * 塔楼在西北，弧形裙楼连向东南 8F，下沉广场在弧内。
 * `east` 只从地址栏 `?cam=east` 进入，东面朝西，用来对照实景。
 * 总览姿态只作为 fitToBox 的起始方向，最终取景由 CameraRig 用 Buildings 组的 Box3 框定。
 * 竖向视场角。打开 `?cam=` 时直接落到该姿态，不播放飞行动画。
 */
export const CAMERA_POSES: Record<CameraId | 'overview', CameraPose> = {
  overview: { position: [24, 70, 210], target: [0, 36, 48], fov: 33 },
  photo1: { position: [20, 1.6, 210], target: [52, 34, 26], fov: 50 },
  p2f000: { position: [8, 52, 248], target: [38, 54, 24], fov: 40 },
  p2f001: { position: [260, 48, -120], target: [45, 42, 58], fov: 36 },
  p2f002: { position: [190, 64, 145], target: [-18, 50, 2], fov: 42 },
  p2f003: { position: [-140, 50, 206], target: [44, 56, 38], fov: 40 },
  // 平视，正对研发中心东立面朝正西。研发中心占画面宽约三分之一在左，塔楼在它右后方，前景是东侧道路和绿地。
  east: { position: [280, 45, 20], target: [103, 45, 20], fov: 60 },
}

export const CAMERA_LIMITS = {
  /** 推近最近距离（米）。近到能数清楼层分缝，但进不了楼板里。 */
  minDistance: 18,
  /** 拉远最远距离（米）。固定机位都在这个范围内。 */
  maxDistance: 520,
  /** 相机高度下限。低于此值就会钻到地面以下。 */
  minCameraY: 0.85,
  /** 注视点高度下限，避免把目标拖进地下后再从下往上看。 */
  minTargetY: 0.35,
  minPolarAngle: 0.05,
}

export function poseDistance(pose: CameraPose): number {
  const dx = pose.position[0] - pose.target[0]
  const dy = pose.position[1] - pose.target[1]
  const dz = pose.position[2] - pose.target[2]
  return Math.hypot(dx, dy, dz)
}

/**
 * camera-controls 的极角：0 在目标正上方，π/2 与目标同高，大于 π/2 时相机低于目标。
 * 返回能让相机高度不低于 minCameraY 的最大极角。
 */
export function maxPolarAngleAboveGround(
  targetY: number,
  distance: number,
  minCameraY = CAMERA_LIMITS.minCameraY,
): number {
  const safeDistance = Math.max(distance, 1e-3)
  const cosine = Math.min(1, Math.max(-1, (minCameraY - targetY) / safeDistance))
  return Math.acos(cosine)
}
