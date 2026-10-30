/** camera-controls `rest`（restThreshold 默认 0.01）。不用 `sleep`，它会再晚几秒。 */

import { useTwinStore } from '../../store/store'
import { holdSnapshot } from '../frameSchedule'

export const CAMERA_REST_TIMEOUT_MS = 1500

/**
 * 拖动、工位还在拆、或这次按键/点击还在处理函数里，才该占着运动通道。
 * 夜景里镜头自己再发一次 wake，不能把已经停稳的单层重新按运动档画下去。
 */
export function shouldRetainCameraWake(action: number, stationAnimating: boolean, gesturing: boolean): boolean {
  return action !== 0 || stationAnimating || gesturing
}

function eventGesture(): boolean {
  const current = typeof window === 'undefined' ? undefined : window.event
  const type = current && typeof current === 'object' && 'type' in current ? String((current as Event).type) : ''
  return type === 'keydown' || type === 'pointerdown' || type === 'click' || type === 'input' || type === 'wheel'
}

/** 单层时钟已经停，而且这一拍不是手势。昼景飞入还占着运动持有时不算。 */
function floorClockQuiet(): boolean {
  if (typeof window === 'undefined') return false
  const state = useTwinStore.getState()
  if (state.view !== 'floor') return false
  if (window.__twinStationExplode?.animating === true) return false
  if (eventGesture()) return false
  if (state.dayNight === 'night') {
    const action = (window.__twinRig as { currentAction?: number } | undefined)?.currentAction ?? 0
    if (action !== 0) return false
    // 夜景里告警、人物或飞入尾部的持有会让 rAF 在超时前按画布速度把 1.8 秒填满。
    // 楼层和工位时钟已经不忙就收一次。昼景仍要等持有归零。
    return window.__twinClocksBusy !== true
  }
  const holds = holdSnapshot()
  return holds.motion + holds.people + holds.alarm === 0
}

type RestRig = {
  addEventListener?: (type: 'rest', fn: () => void) => void
  removeEventListener?: (type: 'rest', fn: () => void) => void
  stop?: () => void
  update?: (delta: number) => boolean
}

let generation = 0
let rested = false
let cleanup: (() => void) | null = null
let snapFinish: ((reason: string) => void) | null = null
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

/** 工位停稳沿：不等 1.5s。飞入还占着 rest 时，把镜头收到终点并停掉每帧 invalidate。 */
export function snapActiveCameraRest(): boolean {
  if (!snapFinish || rested) return false
  snapFinish('idle-snap')
  return true
}

function parkAtEnd(rig: RestRig) {
  // stop 把球坐标收到终点，但本身不发 rest。只 update(0) 时常常只发 sleep。
  // setLookAt 的 Promise 等 rest，等不到就一直占着 motion，性能档会在停稳窗里按能画多快交多少帧。
  const controls = rig as RestRig & { _needsUpdate?: boolean; _hasRested?: boolean }
  controls.stop?.()
  controls._hasRested = false
  controls._needsUpdate = true
  controls.update?.(0)
  controls._needsUpdate = true
  controls.update?.(0)
  controls.update?.(0)
}

export function watchCameraRest(rig: RestRig | null | undefined, invalidate: () => void): () => void {
  cleanup?.()
  cleanup = null
  snapFinish = null
  // 已经 rest 再进来多半是 controlend 重复。再 invalidate 会让 wake/update 在停稳窗里续上几帧。
  if (rested) return () => {}
  const gen = generation
  let raf = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let finishing = false
  const finish = (reason: string) => {
    if (gen !== generation || finishing) return
    finishing = true
    // 超时或工位停稳后若不再 update，飞入 Promise 和 controls 的 wake 持有都不释放。
    // 下一次无关的 invalidate 会按运动档连续要帧。这里把镜头收到终点再标停稳。
    if ((reason === 'timeout-1500' || reason === 'idle-snap') && rig?.stop && rig.update) {
      parkAtEnd(rig)
    }
    markCameraRested(reason)
    invalidate()
    dispose()
  }
  const onRest = () => finish('rest')
  const tick = () => {
    if (gen !== generation || rested) return
    // 夜景会在工位已经停之后继续用 rAF 要帧。时钟安静就收到终点，不再一帧一帧画。
    if (floorClockQuiet()) {
      finish('idle-snap')
      return
    }
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
    if (snapFinish === finish) snapFinish = null
    if (cleanup === dispose) cleanup = null
  }
  snapFinish = finish
  cleanup = dispose
  return dispose
}
