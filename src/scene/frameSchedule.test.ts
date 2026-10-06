import { afterEach, describe, expect, it } from 'vitest'
import {
  bumpTwinFrames,
  channelDue,
  discreteAlarmLit,
  emptyChannelClock,
  holdSnapshot,
  markDueChannels,
  resetFrameChannels,
  retainFrameChannel,
  scheduledHz,
  scheduledIntervalMs,
  soonestWakeMs,
} from './frameSchedule'

describe('D180 续帧调度', () => {
  afterEach(() => {
    resetFrameChannels()
  })

  it('标签页后台一律 0', () => {
    retainFrameChannel('motion')
    retainFrameChannel('people')
    retainFrameChannel('alarm')
    expect(scheduledHz('perf', 'floor', true)).toBe(0)
    expect(scheduledHz('balanced', 'building', true)).toBe(0)
    expect(soonestWakeMs(emptyChannelClock(), 'perf', 0, true, 'floor')).toBe(Number.POSITIVE_INFINITY)
  })

  it('总览两档：人物不续帧；有告警 2 Hz，没告警 0', () => {
    retainFrameChannel('people')
    expect(scheduledHz('balanced', 'building', false)).toBe(0)
    expect(scheduledHz('perf', 'building', false)).toBe(0)
    retainFrameChannel('alarm')
    expect(scheduledHz('balanced', 'building', false)).toBe(2)
    expect(scheduledHz('perf', 'building', false)).toBe(2)
    expect(scheduledIntervalMs('perf', 'building', false)).toBe(500)
  })

  it('单层性能档：人物 10 fps，告警并入不叠加；仅告警则 2 Hz', () => {
    retainFrameChannel('alarm')
    expect(scheduledHz('perf', 'floor', false)).toBe(2)
    retainFrameChannel('people')
    expect(scheduledHz('perf', 'floor', false)).toBe(10)
    expect(scheduledIntervalMs('perf', 'floor', false)).toBe(100)
  })

  it('单层均衡档：人物/告警并入同一调度，最多 30 fps', () => {
    retainFrameChannel('people')
    expect(scheduledHz('balanced', 'floor', false)).toBe(30)
    expect(scheduledIntervalMs('balanced', 'floor', false)).toBeCloseTo(1000 / 30)
    retainFrameChannel('alarm')
    expect(scheduledHz('balanced', 'floor', false)).toBe(30)
    resetFrameChannels()
    retainFrameChannel('alarm')
    expect(scheduledHz('high', 'floor', false)).toBe(30)
  })

  it('交互动画：均衡不限、性能 30 fps', () => {
    retainFrameChannel('motion')
    expect(scheduledHz('balanced', 'building', false)).toBe(Number.POSITIVE_INFINITY)
    expect(scheduledHz('perf', 'building', false)).toBe(30)
    expect(scheduledHz('perf', 'floor', false)).toBe(30)
  })

  it('soonestWakeMs：无源 Infinity；不限 0；限帧按间隔', () => {
    const last = emptyChannelClock()
    expect(soonestWakeMs(last, 'perf', 0, false, 'building')).toBe(Number.POSITIVE_INFINITY)
    retainFrameChannel('alarm')
    last.alarm = 1000
    last.people = 1000
    last.motion = 1000
    expect(soonestWakeMs(last, 'perf', 1200, false, 'building')).toBeCloseTo(300)
    last.alarm = 1000
    last.people = 1000
    last.motion = 1000
    expect(soonestWakeMs(last, 'balanced', 1010, false, 'floor')).toBeCloseTo(1000 / 30 - 10)
    resetFrameChannels()
    retainFrameChannel('people')
    last.alarm = 1000
    last.people = 1000
    last.motion = 1000
    expect(soonestWakeMs(last, 'balanced', 1010, false, 'floor')).toBeCloseTo(1000 / 30 - 10)
  })

  it('channelDue 与告警 2 Hz 亮灭', () => {
    expect(channelDue(0, 1, 0)).toBe(true)
    expect(channelDue(0, 99, 100)).toBe(false)
    expect(channelDue(0, 100, 100)).toBe(true)
    expect(discreteAlarmLit(0)).toBe(true)
    expect(discreteAlarmLit(0.49)).toBe(true)
    expect(discreteAlarmLit(0.5)).toBe(false)
    expect(discreteAlarmLit(1)).toBe(true)
  })

  it('bumpTwinFrames 每调用 +1', () => {
    const w = globalThis as unknown as Window
    w.__twinFrames = 0
    bumpTwinFrames()
    bumpTwinFrames()
    expect(w.__twinFrames).toBe(2)
  })

  it('holdSnapshot / markDue', () => {
    const stop = retainFrameChannel('alarm')
    expect(holdSnapshot().alarm).toBe(1)
    const last = emptyChannelClock()
    markDueChannels(last, 'perf', 5000, 'building')
    expect(last.alarm).toBe(5000)
    stop()
    expect(holdSnapshot().alarm).toBe(0)
  })
})
