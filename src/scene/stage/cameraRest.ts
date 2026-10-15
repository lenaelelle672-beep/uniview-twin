/** camera-controls `rest`（restThreshold 默认 0.01）。不用 `sleep`，它会再晚几秒。 */

export const CAMERA_REST_TIMEOUT_MS = 1500

type RestRig = {
  addEventListener?: (type: 'rest', fn: () => void) => void
  removeEventListener?: (type: 'rest', fn: () => void) => void
}

let generation = 0
let rested = false
let cleanup: (() => void) | null = null
const listeners = new Set<() => void>()

function write(restedNow: boolean, reason: string) {
  rested = restedNow
  if (typeof window !== 'undefined') {
    window.__twinCameraRested = restedNow
    window.__twinCameraRestReason = reason
    if (restedNow) window.__twinCameraRestAt = performance.now()
  }
  for (const listener of listeners) listener()
}

export function subscribeCameraRest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isCameraRested(): boolean {
  return rested
}

export function beginCameraMove(reason = 'move') {
  generation += 1
  cleanup?.()
  cleanup = null
  write(false, reason)
  if (typeof window !== 'undefined') window.__twinCameraMoveAt = performance.now()
}

export function markCameraRested(reason: string) {
  write(true, reason)
}

export function watchCameraRest(rig: RestRig | null | undefined, invalidate: () => void): () => void {
  cleanup?.()
  cleanup = null
  if (rested) {
    invalidate()
    return () => {}
  }
  const gen = generation
  let raf = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = (reason: string) => {
    if (gen !== generation) return
    markCameraRested(reason)
    invalidate()
    dispose()
  }
  const onRest = () => finish('rest')
  const tick = () => {
    if (gen !== generation || rested) return
    invalidate()
    raf = requestAnimationFrame(tick)
  }
  timer = globalThis.setTimeout(() => finish('timeout-1500'), CAMERA_REST_TIMEOUT_MS)
  raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : 0
  rig?.addEventListener?.('rest', onRest)
  const dispose = () => {
    globalThis.clearTimeout(timer)
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    rig?.removeEventListener?.('rest', onRest)
    if (cleanup === dispose) cleanup = null
  }
  cleanup = dispose
  return dispose
}
