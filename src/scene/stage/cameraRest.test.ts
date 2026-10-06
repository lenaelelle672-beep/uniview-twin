import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginCameraMove, isCameraRested, markCameraRested, watchCameraRest } from './cameraRest'

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

  it('已经停稳时不再重开一轮等待', () => {
    markCameraRested('setLookAt')
    const invalidate = vi.fn()
    watchCameraRest(null, invalidate)
    expect(isCameraRested()).toBe(true)
    expect(invalidate).toHaveBeenCalled()
  })
})
