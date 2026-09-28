import type { CameraId } from '../types'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

/**
 * 固定机位。五个 `?cam=` 在 D025 体块（塔楼在西北角）上对照 docs/ref 校准。
 * 总览姿态只作为 fitToBox 的起始方向，最终取景由 CameraRig 框定。
 * 竖向视场角。打开 `?cam=` 时直接落到该姿态，不播放飞行动画。
 */
export const CAMERA_POSES: Record<CameraId | 'overview', CameraPose> = {
  overview: { position: [24, 70, 210], target: [0, 36, 48], fov: 33 },
  photo1: { position: [-24, 1.6, 178], target: [36, 46, 16], fov: 50 },
  p2f000: { position: [-190, 58, 210], target: [28, 48, 28], fov: 40 },
  p2f001: { position: [270, 110, 150], target: [-40, 30, 28], fov: 38 },
  p2f002: { position: [198, 72, 150], target: [-18, 42, 30], fov: 46 },
  p2f003: { position: [-148, 52, 228], target: [36, 48, 40], fov: 44 },
}

export const CAMERA_LIMITS = {
  /** 推近最近距离（米）。近到能数清楼层分缝，但进不了楼板里。 */
  minDistance: 18,
  /** 拉远最远距离（米）。五个固定机位都在这个范围内。 */
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
