import type { CameraId } from '../types'

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
  fov: number
}

export const CAMERA_POSES: Record<CameraId | 'overview', CameraPose> = {
  overview: { position: [24, 70, 210], target: [0, 36, 48], fov: 33 },
  photo1: { position: [-18, 6, 150], target: [0, 40, 16], fov: 44 },
  p2f000: { position: [16, 88, 240], target: [4, 40, 28], fov: 28 },
  p2f001: { position: [176, 74, 150], target: [12, 26, 36], fov: 28 },
  p2f002: { position: [210, 72, 36], target: [8, 28, 32], fov: 28 },
  p2f003: { position: [-156, 80, 176], target: [-6, 32, 22], fov: 28 },
}
