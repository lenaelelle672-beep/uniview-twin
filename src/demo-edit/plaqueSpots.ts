/**
 * T064 铭牌落点与镜头抽样。
 * 只给铭牌懒包和测试用。首屏宿主不引用这份文件。
 */

/** 相对楼板顶。高于工位圆标，不跟圆标抢同一个点。 */
export const PLAQUE_LIFT = 2.62

export const PLAQUE_COUNT = 3

export interface DemoPlaque {
  id: string
  label: string
  accent: string
  x: number
  z: number
}

/**
 * 落点挨着演示锚点，偏开 1.6 米，避免压在摄像头锥尖上。
 * 不是工位圆标坐标，也不读 DeviceBadges。
 */
const TOWER_PLAQUES: readonly DemoPlaque[] = [
  { id: 'edit', label: '摆点', accent: '#3d7dff', x: -18.9, z: 3.2 },
  { id: 'heading', label: '朝向', accent: '#2fbf71', x: 20.0, z: -4.6 },
  { id: 'anchor', label: '锚点', accent: '#e0a106', x: -6.6, z: 11.4 },
]

const B1_PLAQUES: readonly DemoPlaque[] = [
  { id: 'edit', label: '摆点', accent: '#3d7dff', x: 50.67, z: 12.97 },
  { id: 'heading', label: '朝向', accent: '#2fbf71', x: 64.0, z: 16.2 },
  { id: 'anchor', label: '锚点', accent: '#e0a106', x: 12.74, z: -1.2 },
]

export function plaquesForFloor(floorId: string): readonly DemoPlaque[] {
  return floorId === 'B1' ? B1_PLAQUES : TOWER_PLAQUES
}

export interface CameraSample {
  px: number
  py: number
  pz: number
  qx: number
  qy: number
  qz: number
  qw: number
}

const CAMERA_EPS = 1e-5

/** demand 下镜头真的动了才该再要一帧。静止的 update 不算。 */
export function cameraSampleMoved(prev: CameraSample | null, next: CameraSample): boolean {
  if (!prev) return true
  return (
    Math.abs(prev.px - next.px) >= CAMERA_EPS ||
    Math.abs(prev.py - next.py) >= CAMERA_EPS ||
    Math.abs(prev.pz - next.pz) >= CAMERA_EPS ||
    Math.abs(prev.qx - next.qx) >= CAMERA_EPS ||
    Math.abs(prev.qy - next.qy) >= CAMERA_EPS ||
    Math.abs(prev.qz - next.qz) >= CAMERA_EPS ||
    Math.abs(prev.qw - next.qw) >= CAMERA_EPS
  )
}
