import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearFrameChannel, retainFrameChannel } from '../frameSchedule'
import { useTwinStore } from '../../store/store'
import { beginCameraMove, isCameraRested, markCameraRested, shouldRetainCameraWake, snapActiveCameraRest, subscribeCameraRest, watchCameraRest } from './cameraRest'

describe('cameraRest', () => {
  afterEach(() => {
    beginCameraMove('test-reset')
  })

  it('rest 事件或 setLookAt 标记停稳，超时 1.5s 兜底', () => {
    vi.useFakeTimers()
    beginCameraMove('fly')
    expect(isCameraRested()).toBe(false)
    const listeners = new Map<string, () => void>()
    const rig = {
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    }
    const invalidate = vi.fn()
    watchCameraRest(rig, invalidate)
    expect(isCameraRested()).toBe(false)
    listeners.get('rest')?.()
    expect(isCameraRested()).toBe(true)
    expect(invalidate).toHaveBeenCalled()

    beginCameraMove('again')
    watchCameraRest(rig, invalidate)
    expect(isCameraRested()).toBe(false)
    vi.advanceTimersByTime(1500)
    expect(isCameraRested()).toBe(true)
    vi.useRealTimers()
  })

  it('进层用 setLookAt Promise，拖动用 rest 事件', () => {
    const source = readFileSync(new URL('./FloorStageCamera.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/markCameraRested\('setLookAt'\)/)
    expect(source).toMatch(/addEventListener\('controlstart'/)
    expect(source).toMatch(/addEventListener\('controlend'/)
    expect(source).toMatch(/watchCameraRest/)
    const rest = readFileSync(new URL('./cameraRest.ts', import.meta.url), 'utf8')
    expect(rest).toMatch(/timeout-1500/)
    expect(rest).toMatch(/CAMERA_REST_TIMEOUT_MS = 1500/)
    expect(rest).toMatch(/addEventListener\?\.\('rest'/)
  })

  it('订阅者在开移和停稳时收到通知', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeCameraRest(() => seen.push(isCameraRested()))
    beginCameraMove('fly')
    markCameraRested('setLookAt')
    unsubscribe()
    beginCameraMove('after')
    expect(seen).toEqual([false, true])
  })

  it('超时先把 rest 发出去，飞入占用的运动通道才能放开', () => {
    vi.useFakeTimers()
    beginCameraMove('fly')
    const listeners = new Set<() => void>()
    let holds = 1
    const rig = {
      _needsUpdate: false,
      _hasRested: false,
      _updatedLastTime: true,
      addEventListener: (_type: string, fn: () => void) => {
        listeners.add(fn)
      },
      removeEventListener: (_type: string, fn: () => void) => {
        listeners.delete(fn)
      },
      stop() {},
      update(this: { _needsUpdate: boolean; _hasRested: boolean; _updatedLastTime: boolean }) {
        if (this._needsUpdate && this._updatedLastTime && !this._hasRested) {
          this._hasRested = true
          for (const fn of [...listeners]) fn()
          holds = 0
        }
        this._needsUpdate = false
        return false
      },
    }
    watchCameraRest(rig, () => {})
    vi.advanceTimersByTime(1500)
    expect(holds).toBe(0)
    expect(isCameraRested()).toBe(true)
    vi.useRealTimers()
  })

  it('工位停稳沿立刻收到终点，不再每帧要画面', () => {
    beginCameraMove('fly')
    const listeners = new Set<() => void>()
    let updates = 0
    const rig = {
      _needsUpdate: false,
      _hasRested: false,
      addEventListener: (_type: string, fn: () => void) => {
        listeners.add(fn)
      },
      removeEventListener: (_type: string, fn: () => void) => {
        listeners.delete(fn)
      },
      stop() {},
      update(this: { _needsUpdate: boolean; _hasRested: boolean }) {
        updates += 1
        if (this._needsUpdate && !this._hasRested) {
          this._hasRested = true
          for (const fn of [...listeners]) fn()
        }
        this._needsUpdate = false
        return false
      },
    }
    const invalidate = vi.fn()
    watchCameraRest(rig, invalidate)
    expect(snapActiveCameraRest()).toBe(true)
    expect(isCameraRested()).toBe(true)
    expect(updates).toBeGreaterThan(0)
    expect(invalidate).toHaveBeenCalled()
    invalidate.mockClear()
    expect(snapActiveCameraRest()).toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('已经停稳时不再重开一轮等待', () => {
    markCameraRested('setLookAt')
    const invalidate = vi.fn()
    watchCameraRest(null, invalidate)
    expect(isCameraRested()).toBe(true)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('没有手势、工位也不在拆时，不因为 wake 占运动通道', () => {
    expect(shouldRetainCameraWake(0, false, false)).toBe(false)
    expect(shouldRetainCameraWake(1, false, false)).toBe(true)
    expect(shouldRetainCameraWake(0, true, false)).toBe(true)
    expect(shouldRetainCameraWake(0, false, true)).toBe(true)
  })

  it('单层时钟已经停时，rAF 收到终点，不再连着要帧', () => {
    const queued: FrameRequestCallback[] = []
    const host = {} as Window
    vi.stubGlobal('window', host)
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      queued.push(fn)
      return queued.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const previousView = useTwinStore.getState().view
    useTwinStore.setState({ view: 'floor' })
    clearFrameChannel('motion')
    clearFrameChannel('people')
    clearFrameChannel('alarm')
    beginCameraMove('fly')
    let updates = 0
    const rig = {
      addEventListener: () => {},
      removeEventListener: () => {},
      stop() {},
      update() {
        updates += 1
        return false
      },
    }
    const invalidate = vi.fn()
    try {
      watchCameraRest(rig, invalidate)
      expect(isCameraRested()).toBe(false)
      expect(queued.length).toBeGreaterThan(0)
      queued[0]?.(0)
      expect(isCameraRested()).toBe(true)
      expect(updates).toBeGreaterThan(0)
      expect(invalidate).toHaveBeenCalledTimes(1)
      const scheduled = queued.length
      queued[scheduled - 1]?.(0)
      expect(invalidate).toHaveBeenCalledTimes(1)
    } finally {
      useTwinStore.setState({ view: previousView })
      vi.unstubAllGlobals()
    }
  })

  it('夜景时钟不忙时，告警持有不再让 rAF 连着要帧', () => {
    const queued: FrameRequestCallback[] = []
    const host = { __twinClocksBusy: false } as Window
    vi.stubGlobal('window', host)
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      queued.push(fn)
      return queued.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const previous = useTwinStore.getState()
    useTwinStore.setState({ view: 'floor', dayNight: 'night' })
    clearFrameChannel('motion')
    clearFrameChannel('people')
    clearFrameChannel('alarm')
    const release = retainFrameChannel('alarm')
    beginCameraMove('night-alarm')
    const rig = {
      addEventListener: () => {},
      removeEventListener: () => {},
      stop() {},
      update() {
        return false
      },
    }
    const invalidate = vi.fn()
    try {
      watchCameraRest(rig, invalidate)
      queued[0]?.(0)
      expect(isCameraRested()).toBe(true)
      expect(invalidate).toHaveBeenCalledTimes(1)
      const scheduled = queued.length
      queued[scheduled - 1]?.(0)
      expect(invalidate).toHaveBeenCalledTimes(1)

      beginCameraMove('day-alarm')
      useTwinStore.setState({ dayNight: 'day' })
      invalidate.mockClear()
      const before = queued.length
      watchCameraRest(rig, invalidate)
      queued[before]?.(0)
      expect(isCameraRested()).toBe(false)
      expect(invalidate).toHaveBeenCalledTimes(1)
    } finally {
      release()
      clearFrameChannel('alarm')
      useTwinStore.setState({ view: previous.view, dayNight: previous.dayNight })
      vi.unstubAllGlobals()
    }
  })
})
