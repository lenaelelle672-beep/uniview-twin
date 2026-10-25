import type { MotionSample } from './points'

/**
 * drei CameraControls 每个 useFrame 都会 update，并且不看 enabled。
 * enabled 只停拖曳。沿轨期间把 update 换成空函数，播完再交还原来的那份
 * （含 CameraRig 的 delta 上限），并用 setLookAt(false) 把内部球坐标对齐到当前眼点。
 */

type Update = (delta: number) => boolean

export interface MotionClaim {
  enabled?: boolean
  update: Update
  setLookAt: (
    x: number,
    y: number,
    z: number,
    tx: number,
    ty: number,
    tz: number,
    enableTransition?: boolean,
  ) => unknown
  __twinMotionClaim?: boolean
  __twinMotionUpdate?: Update
  __twinMotionDisabled?: boolean
}

const noopUpdate: Update = () => false

export function motionOwnsCamera(rig: MotionClaim | null | undefined): boolean {
  return Boolean(rig?.__twinMotionClaim && rig.update === noopUpdate)
}

export function claimMotionCamera(rig: MotionClaim | null | undefined): boolean {
  if (!rig || typeof rig.update !== 'function' || typeof rig.setLookAt !== 'function') return false
  if (rig.__twinMotionClaim && rig.update === noopUpdate) return true
  if (!rig.__twinMotionUpdate) rig.__twinMotionUpdate = rig.update
  rig.update = noopUpdate
  if (rig.enabled !== false) {
    rig.enabled = false
    rig.__twinMotionDisabled = true
  } else if (!rig.__twinMotionClaim) {
    rig.__twinMotionDisabled = false
  }
  rig.__twinMotionClaim = true
  return true
}

export function releaseMotionCamera(
  rig: MotionClaim | null | undefined,
  eye: MotionSample,
  focus: MotionSample,
): boolean {
  if (!rig?.__twinMotionClaim) return false
  const update = rig.__twinMotionUpdate
  if (update) rig.update = update
  rig.__twinMotionClaim = false
  rig.__twinMotionUpdate = undefined
  const turnedOff = rig.__twinMotionDisabled === true
  rig.__twinMotionDisabled = false
  if (turnedOff) rig.enabled = true
  void rig.setLookAt(eye.x, eye.y, eye.z, focus.x, focus.y, focus.z, false)
  rig.update(0)
  return true
}
