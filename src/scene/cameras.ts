import type { CameraId } from '../types'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

export const CAMERA_POSES: Record<CameraId | 'overview', CameraPose> = {
  overview: { position: [98, 64, 132], target: [12, 16, 14], fov: 33 },
  photo1: { position: [-22, 2.8, 138], target: [10, 36, 6], fov: 44 },
  p2f000: { position: [14, 86, 230], target: [16, 40, 8], fov: 28 },
  p2f001: { position: [168, 72, 150], target: [22, 22, 12], fov: 28 },
  p2f002: { position: [210, 70, 10], target: [18, 24, 8], fov: 28 },
  p2f003: { position: [-150, 78, 170], target: [10, 28, 10], fov: 28 },
}
