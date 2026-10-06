import { afterEach, describe, expect, it } from 'vitest'
import {
  anyChannelHeld,
  balancedAlarmGlow,
  channelDue,
  channelIntervalMs,
  discreteAlarmLit,
  emptyChannelClock,
  markDueChannels,
  nextChannelDelay,
  resetFrameChannels,
  retainFrameChannel,
  soonestWakeMs,
} from './frameSchedule'

describe('续帧调度器节流', () => {
  afterEach(() => {
    resetFrameChannels()
  })

  it('性能档间隔：动画 30 fps、人物 10 fps、告警 2 Hz；均衡档不限', () => {
    expect(channelIntervalMs('motion', 'perf')).toBeCloseTo(1000 / 30)
    expect(channelIntervalMs('people', 'perf')).toBeCloseTo(100)
    expect(channelIntervalMs('alarm', 'perf')).toBeCloseTo(500)
    expect(channelIntervalMs('motion', 'balanced')).toBe(0)
    expect(channelIntervalMs('people', 'high')).toBe(0)
  })

  it('channelDue：不限帧每拍都到期；限帧按间隔', () => {
    expect(channelDue(0, 1, 0)).toBe(true)
    expect(channelDue(1000, 1030, 1000 / 30)).toBe(false)
    expect(channelDue(1000, 1034, 1000 / 30)).toBe(true)
    expect(channelDue(0, 99, 100)).toBe(false)
    expect(channelDue(0, 100, 100)).toBe(true)
  })

  it('soonestWakeMs：无源或 hidden 为 Infinity；不限帧为 0；限帧取最近', () => {
    const last = emptyChannelClock()
    expect(soonestWakeMs(last, 'perf', 0, false)).toBe(Number.POSITIVE_INFINITY)
    const release = retainFrameChannel('alarm')
    expect(soonestWakeMs(last, 'perf', 0, true)).toBe(Number.POSITIVE_INFINITY)
    last.alarm = 1000
    expect(soonestWakeMs(last, 'perf', 1200, false)).toBeCloseTo(300)
    expect(soonestWakeMs(last, 'balanced', 1200, false)).toBe(0)
    release()
  })

  it('多通道取最近唤醒；markDue 只推进到期的通道', () => {
    const last = emptyChannelClock()
    const stopPeople = retainFrameChannel('people')
    const stopAlarm = retainFrameChannel('alarm')
    last.people = 1000
    last.alarm = 1000
    expect(soonestWakeMs(last, 'perf', 1050, false)).toBeCloseTo(50)
    markDueChannels(last, 'perf', 1100)
    expect(last.people).toBe(1100)
    expect(last.alarm).toBe(1000)
    stopPeople()
    stopAlarm()
  })

  it('retain / release 引用计数，归零后不再续帧', () => {
    const a = retainFrameChannel('motion')
    const b = retainFrameChannel('motion')
    expect(anyChannelHeld()).toBe(true)
    a()
    expect(anyChannelHeld()).toBe(true)
    b()
    expect(anyChannelHeld()).toBe(false)
    expect(soonestWakeMs(emptyChannelClock(), 'perf', 0, false)).toBe(Number.POSITIVE_INFINITY)
  })

  it('nextChannelDelay 不会为负', () => {
    expect(nextChannelDelay(0, 5000, 100)).toBe(0)
    expect(nextChannelDelay(0, 40, 100)).toBe(60)
  })

  it('性能档告警 2 Hz 离散亮灭，均衡档保持正弦脉冲', () => {
    expect(discreteAlarmLit(0)).toBe(true)
    expect(discreteAlarmLit(0.49)).toBe(true)
    expect(discreteAlarmLit(0.5)).toBe(false)
    expect(discreteAlarmLit(0.99)).toBe(false)
    expect(discreteAlarmLit(1)).toBe(true)
    expect(discreteAlarmLit(1.5)).toBe(false)
    const glow = balancedAlarmGlow(0)
    expect(glow).toBeCloseTo(0.78)
    expect(balancedAlarmGlow(Math.PI / 10)).toBeCloseTo(1)
  })
})
