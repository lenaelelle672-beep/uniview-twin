import { describe, expect, it } from 'vitest'
import {
  FAR_LAMP_CAP,
  FLASH_SENTINEL_RADIUS,
  LAMP_SENTINEL_RADIUS,
  PERF_SENTINEL_SCALE,
  farthestLampIndexes,
  frustumPauseWanted,
  frustumQuery,
  frustumSentinelScale,
  hideInstance,
  instanceWorld,
  pickFrustumSearch,
  readInstance,
  restoreInstance,
  transformSphere,
  unionSphere,
} from './plan'
import { blinkLive, emitBlink, subscribeBlink, type FrustumBlinkState } from './blinkGate'

const globalBlink = globalThis as typeof globalThis & { __twinFrustumBlink?: FrustumBlinkState }

describe('视锥暂停开关', () => {
  it('均衡和高画质默认关，性能档默认开，查询盖过画质', () => {
    expect(frustumPauseWanted('balanced', '')).toEqual({ on: false, reason: 'off' })
    expect(frustumPauseWanted('high', '?q=high')).toEqual({ on: false, reason: 'off' })
    expect(frustumPauseWanted('perf', '?q=perf')).toEqual({ on: true, reason: 'perf' })
    expect(frustumPauseWanted('balanced', '?frustum=1')).toEqual({ on: true, reason: 'query' })
    expect(frustumPauseWanted('perf', '?q=perf&frustum=0')).toEqual({ on: false, reason: 'query-off' })
    expect(frustumQuery('?frustum=10')).toBeNull()
    expect(frustumQuery('?frustum=')).toBeNull()
  })

  it('地址栏丢掉参数时回读启动地址', () => {
    expect(pickFrustumSearch('', 'http://localhost/?frustum=1')).toBe('?frustum=1')
    expect(pickFrustumSearch('?q=balanced', 'http://localhost/?q=perf&frustum=0#x')).toBe('?q=perf&frustum=0')
    expect(pickFrustumSearch('?frustum=1', 'http://localhost/?frustum=0')).toBe('?frustum=1')
  })

  it('性能档哨兵更小', () => {
    expect(frustumSentinelScale('perf')).toBe(PERF_SENTINEL_SCALE)
    expect(frustumSentinelScale('balanced')).toBe(1)
    expect(PERF_SENTINEL_SCALE).toBeLessThan(1)
    expect(FAR_LAMP_CAP).toBe(12)
    expect(LAMP_SENTINEL_RADIUS).toBeGreaterThan(FLASH_SENTINEL_RADIUS)
  })
})

describe('远距路灯挑选和实例隐藏', () => {
  it('只留离相机最远的几盏', () => {
    const spots = [
      { index: 0, x: 0, y: 0, z: 0 },
      { index: 1, x: 10, y: 0, z: 0 },
      { index: 2, x: 40, y: 0, z: 0 },
      { index: 3, x: 3, y: 0, z: 0 },
    ]
    expect(farthestLampIndexes(spots, { x: 0, y: 0, z: 0 }, 2)).toEqual([2, 1])
    expect(farthestLampIndexes(spots, { x: 0, y: 0, z: 0 }, 0)).toEqual([])
  })

  it('藏起实例时留下平移，恢复后矩阵原样', () => {
    const array = new Float32Array(16)
    array.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1])
    const saved = readInstance(array, 0)
    hideInstance(array, 0)
    expect(array[0]).toBe(0)
    expect(array[5]).toBe(0)
    expect(array[10]).toBe(0)
    expect(array[12]).toBe(4)
    expect(array[13]).toBe(5)
    expect(array[14]).toBe(6)
    restoreInstance(array, 0, saved)
    expect(Array.from(array)).toEqual(saved)
  })

  it('实例平移乘上父矩阵', () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, -3, 1]
    const instance = new Float32Array(16)
    instance.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1, 4, 1])
    expect(instanceWorld(identity, instance, 0)).toEqual({ x: 12, y: 1, z: 1 })
    const sphere = transformSphere(identity, { x: 1, y: 2, z: 3 }, 4)
    expect(sphere).toEqual({ x: 11, y: 2, z: 0, r: 4 })
    expect(unionSphere([])).toBeNull()
    const union = unionSphere([
      { x: 0, y: 0, z: 0, r: 1 },
      { x: 4, y: 0, z: 0, r: 1 },
    ])
    expect(union?.r).toBeGreaterThan(2)
  })
})

describe('闪烁门闩', () => {
  it('没开或没有宿主时继续闪，视锥外才停', () => {
    delete globalBlink.__twinFrustumBlink
    expect(blinkLive('alarm')).toBe(true)
    expect(blinkLive('flash')).toBe(true)
    globalBlink.__twinFrustumBlink = {
      on: true,
      reason: 'perf',
      scale: 0.72,
      primed: true,
      alarm: null,
      flash: false,
      sign: null,
      lamps: 0,
      lampsHidden: 0,
    }
    expect(blinkLive('alarm')).toBe(true)
    expect(blinkLive('flash')).toBe(false)
    globalBlink.__twinFrustumBlink = { ...globalBlink.__twinFrustumBlink, on: false }
    expect(blinkLive('flash')).toBe(true)
    delete globalBlink.__twinFrustumBlink
  })

  it('没有事件目标时订阅是空操作', () => {
    const stop = subscribeBlink(() => {})
    expect(typeof stop).toBe('function')
    expect(stop()).toBeUndefined()
  })

  it('能把状态写到全局', () => {
    emitBlink({
      on: false,
      reason: 'off',
      scale: 1,
      primed: false,
      alarm: null,
      flash: null,
      sign: null,
      lamps: 0,
      lampsHidden: 0,
    })
    expect(globalBlink.__twinFrustumBlink?.on).toBe(false)
    delete globalBlink.__twinFrustumBlink
  })
})
