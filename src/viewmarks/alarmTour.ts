import { Vector3 } from 'three'
import { useTwinStore } from '../store/store'
import type { Viewpoint } from '../url/viewpoint'
import { alarmFloorIds, floorTourPose } from './tourPose'
import { TWIN_TOUR_EVENT, type TwinTourDetail } from './tourEvents'

/** 每层停下的时间。过渡沿用 CameraRig 已经设好的阻尼，这里不改它。 */
export const TOUR_DWELL_MS = 800

const position = new Vector3()
const target = new Vector3()
const focal = new Vector3()

let activeCancel: (() => void) | null = null

function emit(detail: TwinTourDetail) {
  window.dispatchEvent(new CustomEvent(TWIN_TOUR_EVENT, { detail }))
}

function freezeRig() {
  const rig = window.__twinRig
  if (!rig) return
  rig.getPosition(position, false)
  rig.getTarget(target, false)
  focal.set(0, 0, 0)
  rig.getFocalOffset?.(focal, false)
  void rig.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false)
  if (typeof rig.setFocalOffset === 'function') void rig.setFocalOffset(focal.x, focal.y, focal.z, false)
  rig.update(0)
  window.__vpP?.()
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

function fly(pose: Viewpoint, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const rig = window.__twinRig
    if (!rig) {
      resolve()
      return
    }
    const camera = rig.camera
    if (camera && Math.abs(camera.fov - pose.fov) > 0.05) {
      camera.fov = pose.fov
      camera.updateProjectionMatrix()
    }
    if (typeof rig.setFocalOffset === 'function') void rig.setFocalOffset(pose.fx, pose.fy, pose.fz, false)
    let raf = 0
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      cancelAnimationFrame(raf)
      resolve()
    }
    const tick = () => {
      if (signal.aborted) {
        finish()
        return
      }
      window.__vpP?.()
      raf = requestAnimationFrame(tick)
    }
    signal.addEventListener('abort', finish, { once: true })
    raf = requestAnimationFrame(tick)
    void rig.setLookAt(pose.px, pose.py, pose.pz, pose.tx, pose.ty, pose.tz, true).then(finish)
  })
}

/** 按标高依次 setLookAt 有告警的楼层。Esc / 画布外点击会停在当前画面。 */
export function startAlarmTour(): { cancel: () => void } {
  activeCancel?.()
  const floors = alarmFloorIds(useTwinStore.getState().floors)
  if (floors.length === 0) {
    window.__vpT = false
    emit({ active: false, floorId: null, empty: true })
    activeCancel = null
    return { cancel: () => {} }
  }

  const abort = new AbortController()
  let removePointer = () => {}
  let ended = false
  const finish = (empty: boolean) => {
    if (ended) return
    ended = true
    window.__vpT = false
    removePointer()
    if (activeCancel === cancel) activeCancel = null
    emit({
      active: false,
      floorId: useTwinStore.getState().selectedFloor,
      empty,
    })
  }
  const cancel = () => {
    if (abort.signal.aborted) return
    freezeRig()
    abort.abort()
    finish(false)
  }

  const onPointer = (event: PointerEvent) => {
    const node = event.target
    if (node instanceof Element && node.closest('[data-viewmark-root]')) return
    cancel()
  }
  window.addEventListener('pointerdown', onPointer, true)
  removePointer = () => window.removeEventListener('pointerdown', onPointer, true)

  window.__vpT = true
  window.__vpH = false
  activeCancel = cancel
  emit({ active: true, floorId: floors[0] ?? null, empty: false })

  void (async () => {
    try {
      for (const floorId of floors) {
        if (abort.signal.aborted) return
        emit({ active: true, floorId, empty: false })
        useTwinStore.getState().enterFloor(floorId)
        await fly(floorTourPose(floorId), abort.signal)
        if (abort.signal.aborted) return
        await wait(TOUR_DWELL_MS, abort.signal)
      }
    } finally {
      if (!abort.signal.aborted) finish(false)
    }
  })()

  return { cancel }
}
