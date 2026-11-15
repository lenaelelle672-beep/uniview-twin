/**
 * T128：巡游体只在会话里往前走。
 * drei CurveModifier 自己不推时间，这里按会话调用 moveAlongCurve，并 autoInvalidate 一帧。
 * 停掉之后不再排帧，也不再要帧。
 */

export const CURVE_PATROL_OFFSET_PER_SECOND = 0.08

const MAX_STEP_SECONDS = 0.05

export interface CurveStepper {
  moveAlongCurve: (amount: number) => void
}

export interface CurveClock {
  now: () => number
  request: (callback: (time: number) => void) => number
  cancel: (handle: number) => void
}

export function browserCurveClock(): CurveClock {
  return {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
  }
}

/**
 * 会话进行时才推进。每一拍先 moveAlongCurve，再 autoInvalidate。
 * 返回的停止函数可以重复调用。
 */
export function startCurveAutoInvalidate(
  flow: CurveStepper,
  invalidate: () => void,
  clock: CurveClock = browserCurveClock(),
  stepPerSecond = CURVE_PATROL_OFFSET_PER_SECOND,
): () => void {
  let stopped = false
  let handle = 0
  let last = clock.now()
  const tick = (time: number) => {
    if (stopped) return
    const delta = Math.min(MAX_STEP_SECONDS, Math.max(0, (time - last) / 1000))
    last = time
    flow.moveAlongCurve(delta * stepPerSecond)
    if (stopped) return
    invalidate()
    if (stopped) return
    handle = clock.request(tick)
  }
  handle = clock.request(tick)
  return () => {
    if (stopped) return
    stopped = true
    clock.cancel(handle)
    handle = 0
  }
}
