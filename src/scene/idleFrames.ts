import { useTwinStore } from '../store/store'
import { holdSnapshot } from './frameSchedule'
import { isCameraRested, markCameraRested, snapActiveCameraRest } from './stage/cameraRest'

/**
 * 工位已经停时，贴图、拾取树、预编译和吊顶会各自再要一帧。
 * 快画布把这些帧都交进 1.8 秒停稳窗。安静期结束再画一次，窗长仍是 2.2 秒。
 * 昼景还要等镜头 rest，并且运动/人物/告警持有都是 0。
 * 夜景在楼层和工位时钟已经不忙、又没有拖动时，这些持有不再把空闲帧放进采样窗。
 * 指针、键盘和还在动的时候不攒。
 */
export const IDLE_FRAME_QUIET_MS = 2200
const INPUT_BYPASS_MS = 500

type Invalidate = (frames?: number) => void

let inputAt = 0
let inputArmed = false

function noteInput(): void {
  inputAt = performance.now()
}

/** 键和点击的处理函数可能比本监听更早注册。同步 invalidate 时 window.event 仍是那次输入。 */
export function frameInputActive(now = performance.now()): boolean {
  return inputActive(now)
}

function inputActive(now: number): boolean {
  const current = typeof window === 'undefined' ? undefined : window.event
  const type = current && typeof current === 'object' && 'type' in current ? String((current as Event).type) : ''
  if (type === 'keydown' || type === 'pointerdown' || type === 'click' || type === 'input' || type === 'wheel') {
    inputAt = now
    return true
  }
  return now - inputAt < INPUT_BYPASS_MS
}

function armInput(): void {
  if (inputArmed || typeof window === 'undefined') return
  inputArmed = true
  window.addEventListener('pointerdown', noteInput, true)
  window.addEventListener('keydown', noteInput, true)
  window.addEventListener('click', noteInput, true)
  window.addEventListener('input', noteInput, true)
}

/** 单层停稳。刚有指针、键盘、点击或输入时不算，避免把操作帧吞掉。 */
export function floorIdleForFrames(now = performance.now()): boolean {
  if (inputActive(now)) return false
  const state = useTwinStore.getState()
  if (state.view !== 'floor') return false
  if (window.__twinStationExplode?.animating === true) return false
  const holds = holdSnapshot()
  const held = holds.motion + holds.people + holds.alarm !== 0
  if (state.dayNight === 'night') {
    // 正式采样时夜景持有常常还没松开，上一轮只在持有为 0 时 stop，Δ 没有变。
    // 时钟不忙且没有拖动才攒。爆炸和拖动仍立刻画。昼景不走这条。
    if (window.__twinClocksBusy === true) return false
    const action = (window.__twinRig as { currentAction?: number } | undefined)?.currentAction ?? 0
    if (action !== 0) return false
    return true
  }
  if (held) return false
  return isCameraRested()
}

type NightRig = {
  stop?: () => void
  _needsUpdate?: boolean
  _hasRested?: boolean
}

/**
 * 夜景单层时钟已停、三类持有都是 0，但 camera-controls 还没内部 rest。
 * 它的 wake 走的是挂载时抓住的 invalidate，闸门外，会按画布速度把 1.8 秒填满。
 * 只 stop 并把内部标志收上，不 update，避免 wake 再要一帧。昼景不进这里。
 */
export function settleNightCamera(rig: NightRig | null | undefined, now = performance.now()): boolean {
  if (!floorIdleForFrames(now)) return false
  if (useTwinStore.getState().dayNight !== 'night') return false
  if (!rig?.stop || rig._hasRested !== false) return false
  // 监听还在就走原来的收尾，把镜头收到终点并只补一帧。没有监听时只停内部 wake。
  if (snapActiveCameraRest()) {
    rig._needsUpdate = false
    rig._hasRested = true
    return true
  }
  rig.stop()
  rig._needsUpdate = false
  rig._hasRested = true
  if (!isCameraRested()) markCameraRested('night-idle-park')
  return true
}

export function createIdleFrameGate(
  raw: Invalidate,
  idle: (now: number) => boolean,
  now: () => number = () => performance.now(),
): Invalidate {
  let until = 0
  let extra = false
  let timer = 0
  const clearTimer = () => {
    if (!timer) return
    clearTimeout(timer)
    timer = 0
  }
  const flush = () => {
    timer = 0
    if (!extra) return
    extra = false
    const t = now()
    if (!idle(t)) {
      until = 0
      return
    }
    until = t + IDLE_FRAME_QUIET_MS
    raw(1)
    if (extra) arm()
  }
  const arm = () => {
    if (timer) return
    const wait = Math.max(0, until - now())
    timer = setTimeout(flush, wait) as unknown as number
  }
  return (frames?: number) => {
    const t = now()
    if (!idle(t)) {
      extra = false
      clearTimer()
      until = 0
      raw(frames)
      return
    }
    // 第一帧也推迟。快画布会把贴图、拾取、预编译和吊顶在 1.8 秒里各交一帧。
    extra = true
    if (t >= until) until = t + IDLE_FRAME_QUIET_MS
    arm()
  }
}

export function installIdleFrameGate(state: { invalidate: Invalidate }): void {
  const current = state.invalidate as Invalidate & { __idleGate?: boolean }
  if (current.__idleGate) return
  armInput()
  const wrapped = createIdleFrameGate((frames) => current(frames), floorIdleForFrames) as Invalidate & {
    __idleGate?: boolean
  }
  wrapped.__idleGate = true
  state.invalidate = wrapped
}
