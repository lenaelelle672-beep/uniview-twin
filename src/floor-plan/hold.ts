/**
 * T118：平面图俯视时暂停 CameraControls 的拖曳。
 * 不换 update，不换 setLookAt，不把正交相机交给 CameraControls。
 * enabled 只停拖曳；沿轨如果已经占着 update，这里不动它。
 */

export interface PlanRig {
  enabled?: boolean
  stop?: () => void
  update?: (delta: number) => boolean
  setLookAt?: (...args: unknown[]) => unknown
  __twinPlanPaused?: boolean
  __twinPlanEnabled?: boolean
  __twinMotionClaim?: boolean
}

export function pausePlanRig(rig: PlanRig | null | undefined): boolean {
  if (!rig || rig.__twinMotionClaim) return false
  if (rig.__twinPlanPaused) return true
  rig.stop?.()
  rig.__twinPlanEnabled = rig.enabled !== false
  rig.enabled = false
  rig.__twinPlanPaused = true
  return true
}

export function resumePlanRig(rig: PlanRig | null | undefined): boolean {
  if (!rig?.__twinPlanPaused) return false
  const restore = rig.__twinPlanEnabled === true
  rig.__twinPlanPaused = false
  rig.__twinPlanEnabled = undefined
  if (restore) rig.enabled = true
  return true
}
