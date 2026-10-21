/** 拖滑条时合并 store 写入。3D 的 invalidate 跟在这一帧后面，不跟每一次 input。 */
export const ALARM_TIMELINE_INVALIDATE_THROTTLE_MS = 120

export interface InvalidateThrottle {
  push: (fn: () => void) => void
  flush: () => void
  cancel: () => void
}

export function createInvalidateThrottle(
  waitMs = ALARM_TIMELINE_INVALIDATE_THROTTLE_MS,
  now: () => number = () => Date.now(),
): InvalidateThrottle {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastRun = now() - waitMs
  let queued: (() => void) | null = null

  const run = () => {
    const fn = queued
    queued = null
    lastRun = now()
    fn?.()
  }

  return {
    push(fn) {
      queued = fn
      const elapsed = now() - lastRun
      if (elapsed >= waitMs) {
        if (timer != null) {
          clearTimeout(timer)
          timer = null
        }
        run()
        return
      }
      if (timer != null) return
      timer = setTimeout(() => {
        timer = null
        run()
      }, waitMs - elapsed)
    },
    flush() {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
      if (queued) run()
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
      queued = null
    },
  }
}
