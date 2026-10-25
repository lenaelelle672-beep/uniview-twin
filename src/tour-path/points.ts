import { Vector3 } from 'three'
import { alarmFloorIds, floorTourPose } from '../viewmarks/tourPose'
import { motionPathLoopOn } from './gate'

export interface MotionSample {
  x: number
  y: number
  z: number
}

export interface MotionRoute {
  points: MotionSample[]
  focus: MotionSample
  floors: string[]
  /** 传给 MotionPathControls。缺省按 drei 会变成 true，所以这里必须显式带上。 */
  loop: boolean
  seconds: number
}

const MIN_SECONDS = 4.5
const MAX_SECONDS = 14
const SECONDS_PER_LEG = 1.15

export function alarmTourFloors(
  floors: readonly { id: string; level: number; alarmCount: number }[],
): string[] {
  return alarmFloorIds(floors)
}

export function readTourEye(): MotionSample | null {
  const rig = typeof window === 'undefined' ? undefined : window.__twinRig
  if (!rig?.getPosition) return null
  const eye = new Vector3()
  rig.getPosition(eye, false)
  if (!Number.isFinite(eye.x) || !Number.isFinite(eye.y) || !Number.isFinite(eye.z)) return null
  return { x: eye.x, y: eye.y, z: eye.z }
}

function farEnough(from: MotionSample, x: number, y: number, z: number): boolean {
  const dx = from.x - x
  const dy = from.y - y
  const dz = from.z - z
  return dx * dx + dy * dy + dz * dz > 0.75 * 0.75
}

/**
 * 导览楼层机位串成一条轨。眼点在起点，避免一挂上就从总览跳走。
 * 只有一个点时补一段进近，CatmullRom 至少要两点。
 */
export function buildMotionRoute(
  floors: readonly string[],
  eye: MotionSample | null,
  loop?: boolean,
): MotionRoute | null {
  if (floors.length === 0) return null
  const poses = floors.map((floorId) => floorTourPose(floorId))
  const points: MotionSample[] = []
  if (eye) points.push(eye)
  for (const pose of poses) {
    const last = points[points.length - 1]
    if (last && !farEnough(last, pose.px, pose.py, pose.pz)) continue
    points.push({ x: pose.px, y: pose.py, z: pose.pz })
  }
  if (points.length === 0) return null
  if (points.length === 1) {
    const end = points[0]
    points.unshift({ x: end.x + 14, y: end.y + 8, z: end.z + 20 })
  }
  const focus = { x: 0, y: 0, z: 0 }
  for (const pose of poses) {
    focus.x += pose.tx
    focus.y += pose.ty
    focus.z += pose.tz
  }
  focus.x /= poses.length
  focus.y /= poses.length
  focus.z /= poses.length
  const legs = Math.max(1, points.length - 1)
  const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, legs * SECONDS_PER_LEG))
  return {
    points,
    focus,
    floors: [...floors],
    loop: loop ?? motionPathLoopOn(),
    seconds,
  }
}
