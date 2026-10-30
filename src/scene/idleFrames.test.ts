import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFrameChannel, retainFrameChannel } from './frameSchedule'
import { beginCameraMove, isCameraRested, markCameraRested } from './stage/cameraRest'
import { useTwinStore } from '../store/store'
import { IDLE_FRAME_QUIET_MS, createIdleFrameGate, floorIdleForFrames, settleNightCamera } from './idleFrames'

describe('空闲停稳合并需求帧', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('按键同步要帧时不算空闲', () => {
    vi.stubGlobal('window', { event: { type: 'keydown' } })
    expect(floorIdleForFrames()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('还在动时每次都立刻要帧', () => {
    vi.useFakeTimers()
    let clock = 0
    const raw = vi.fn()
    const gate = createIdleFrameGate(raw, () => false, () => clock)
    gate()
    gate(2)
    expect(raw).toHaveBeenCalledTimes(2)
    clock = IDLE_FRAME_QUIET_MS
    vi.advanceTimersByTime(IDLE_FRAME_QUIET_MS)
    expect(raw).toHaveBeenCalledTimes(2)
  })

  it('停稳后连着要的帧不立刻画，安静期结束再补一帧', () => {
    vi.useFakeTimers()
    let clock = 1_000
    const raw = vi.fn()
    const gate = createIdleFrameGate(raw, () => true, () => clock)
    gate()
    gate()
    gate()
    expect(raw).toHaveBeenCalledTimes(0)
    clock = 1_000 + IDLE_FRAME_QUIET_MS
    vi.advanceTimersByTime(IDLE_FRAME_QUIET_MS)
    expect(raw).toHaveBeenCalledTimes(1)
  })

  it('夜景持有为 0 时不等镜头 rest，昼景仍要等', () => {
    const now = performance.now() + 5_000
    const previous = useTwinStore.getState()
    vi.stubGlobal('window', {})
    clearFrameChannel('motion')
    clearFrameChannel('people')
    clearFrameChannel('alarm')
    beginCameraMove('night-idle')
    useTwinStore.setState({ view: 'floor', dayNight: 'night' })
    expect(isCameraRested()).toBe(false)
    expect(floorIdleForFrames(now)).toBe(true)
    useTwinStore.setState({ dayNight: 'day' })
    expect(floorIdleForFrames(now)).toBe(false)
    markCameraRested('day')
    expect(floorIdleForFrames(now)).toBe(true)
    const release = retainFrameChannel('alarm')
    useTwinStore.setState({ dayNight: 'night' })
    beginCameraMove('alarm')
    const host = window as Window
    host.__twinClocksBusy = false
    expect(floorIdleForFrames(now)).toBe(true)
    host.__twinClocksBusy = true
    expect(floorIdleForFrames(now)).toBe(false)
    host.__twinClocksBusy = false
    useTwinStore.setState({ dayNight: 'day' })
    expect(floorIdleForFrames(now)).toBe(false)
    release()
    useTwinStore.setState({ view: previous.view, dayNight: previous.dayNight })
    vi.unstubAllGlobals()
  })

  it('夜景控件还没内部 rest 时只 stop，不 update', () => {
    const now = performance.now() + 5_000
    const previous = useTwinStore.getState()
    vi.stubGlobal('window', {})
    clearFrameChannel('motion')
    clearFrameChannel('people')
    clearFrameChannel('alarm')
    beginCameraMove('night-park')
    useTwinStore.setState({ view: 'floor', dayNight: 'night' })
    const update = vi.fn()
    const rig = { stop: vi.fn(), update, _needsUpdate: true, _hasRested: false }
    expect(settleNightCamera(rig, now)).toBe(true)
    expect(rig.stop).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()
    expect(rig._hasRested).toBe(true)
    expect(rig._needsUpdate).toBe(false)
    expect(isCameraRested()).toBe(true)
    expect(settleNightCamera(rig, now)).toBe(false)
    useTwinStore.setState({ dayNight: 'day' })
    rig._hasRested = false
    beginCameraMove('day')
    expect(settleNightCamera(rig, now)).toBe(false)
    expect(rig.stop).toHaveBeenCalledTimes(1)
    const release = retainFrameChannel('motion')
    useTwinStore.setState({ dayNight: 'night' })
    beginCameraMove('motion')
    rig._hasRested = false
    const host = window as Window
    host.__twinClocksBusy = false
    expect(settleNightCamera(rig, now)).toBe(true)
    expect(rig.stop).toHaveBeenCalledTimes(2)
    host.__twinClocksBusy = true
    rig._hasRested = false
    beginCameraMove('busy')
    expect(settleNightCamera(rig, now)).toBe(false)
    host.__twinClocksBusy = false
    release()
    useTwinStore.setState({ view: previous.view, dayNight: previous.dayNight })
    vi.unstubAllGlobals()
  })

  it('安静期内重新动起来就立刻要帧，不再补合并的那一帧', () => {
    vi.useFakeTimers()
    let clock = 0
    let idle = true
    const raw = vi.fn()
    const gate = createIdleFrameGate(raw, () => idle, () => clock)
    gate()
    gate()
    expect(raw).toHaveBeenCalledTimes(0)
    idle = false
    clock = 400
    gate()
    expect(raw).toHaveBeenCalledTimes(1)
    clock = IDLE_FRAME_QUIET_MS
    vi.advanceTimersByTime(IDLE_FRAME_QUIET_MS)
    expect(raw).toHaveBeenCalledTimes(1)
  })
})
