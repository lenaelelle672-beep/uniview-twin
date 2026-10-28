/**
 * T080：拖落点时锁住 CameraControls 的轨道。
 *
 * drei DragControls 在 onDragEnd 里无条件把 controls.enabled 写成 true。
 * 按下前镜头若已被沿轨、对焦或框选关掉，松手不能被它重新打开。
 * 门闩只交还自己按下时记下的那一档。
 */

export interface DragCamera {
  enabled?: boolean
  __twinDragLatch?: { restore: boolean }
}

export function claimDragCamera(controls: DragCamera | null | undefined): boolean {
  if (!controls) return false
  if (controls.__twinDragLatch) return true
  controls.__twinDragLatch = { restore: controls.enabled !== false }
  controls.enabled = false
  return true
}

export function releaseDragCamera(controls: DragCamera | null | undefined): boolean {
  const latch = controls?.__twinDragLatch
  if (!controls || !latch) return false
  controls.enabled = latch.restore
  controls.__twinDragLatch = undefined
  return true
}

export function dragCameraHeld(controls: DragCamera | null | undefined): boolean {
  return controls?.__twinDragLatch != null
}
