import type { QualityTier } from '../types'

export type FrameChannel = 'motion' | 'people' | 'alarm'

const CHANNELS: FrameChannel[] = ['motion', 'people', 'alarm']

const holds: Record<FrameChannel, number> = { motion: 0, people: 0, alarm: 0 }

export function retainFrameChannel(channel: FrameChannel): () => void {
  holds[channel] += 1
  return () => {
    holds[channel] = Math.max(0, holds[channel] - 1)
  }
}

export function resetFrameChannels(): void {
  holds.motion = 0
  holds.people = 0
  holds.alarm = 0
}

export function channelHeld(channel: FrameChannel): boolean {
  return holds[channel] > 0
}

export function holdSnapshot(): Record<FrameChannel, number> {
  return { motion: holds.motion, people: holds.people, alarm: holds.alarm }
}

/**
 * D180 续帧上限（Hz）。0 = 不续帧；Infinity = 不限帧。
 * 告警 2 Hz = 亮 0.5 s / 灭 0.5 s，每次切换 1 帧。
 * 总览忽略人物；单层人物与告警并入同一调度，不叠加。
 * 单层：性能 ≤10（仅告警则 2）、均衡/高 ≤30。
 */
export function scheduledHz(quality: QualityTier, view: string, hidden: boolean): number {
  if (hidden) return 0
  if (holds.motion > 0) return quality === 'perf' ? 30 : Number.POSITIVE_INFINITY
  if (view !== 'floor') return holds.alarm > 0 ? 2 : 0
  if (quality === 'perf') {
    if (holds.people > 0) return 10
    if (holds.alarm > 0) return 2
    return 0
  }
  if (holds.people > 0 || holds.alarm > 0) return 30
  return 0
}

export function scheduledIntervalMs(quality: QualityTier, view: string, hidden: boolean): number {
  const hz = scheduledHz(quality, view, hidden)
  if (hz <= 0) return Number.POSITIVE_INFINITY
  if (!Number.isFinite(hz)) return 0
  return 1000 / hz
}

export type ChannelClock = Record<FrameChannel, number>

export function emptyChannelClock(): ChannelClock {
  return { motion: 0, people: 0, alarm: 0 }
}

/** @deprecated 用 scheduledIntervalMs；保留给人物 place() 节流。 */
export function channelIntervalMs(channel: FrameChannel, quality: QualityTier): number {
  if (channel === 'motion') return quality === 'perf' ? 1000 / 30 : 0
  if (channel === 'people') return quality === 'perf' ? 100 : 1000 / 30
  return quality === 'perf' ? 500 : 1000 / 30
}

export function channelDue(lastMs: number, nowMs: number, intervalMs: number): boolean {
  if (intervalMs <= 0) return true
  if (!Number.isFinite(intervalMs)) return false
  return nowMs - lastMs >= intervalMs
}

export function nextChannelDelay(lastMs: number, nowMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 0
  if (!Number.isFinite(intervalMs)) return Number.POSITIVE_INFINITY
  return Math.max(0, intervalMs - (nowMs - lastMs))
}

export function soonestWakeMs(
  last: ChannelClock,
  quality: QualityTier,
  now: number,
  hidden: boolean,
  view = 'floor',
): number {
  const interval = scheduledIntervalMs(quality, view, hidden)
  if (!Number.isFinite(interval)) return Number.POSITIVE_INFINITY
  if (interval === 0) return 0
  const lastAny = Math.max(last.motion, last.people, last.alarm)
  return nextChannelDelay(lastAny, now, interval)
}

export function markDueChannels(last: ChannelClock, quality: QualityTier, now: number, view = 'floor'): void {
  if (scheduledIntervalMs(quality, view, false) === Number.POSITIVE_INFINITY) return
  for (const channel of CHANNELS) last[channel] = now
}

/** 2 Hz 离散亮灭：偶数半秒亮。 */
export function discreteAlarmLit(elapsedSec: number): boolean {
  return Math.floor(elapsedSec * 2) % 2 === 0
}

export function balancedAlarmGlow(elapsedSec: number): number {
  return 0.78 + 0.22 * Math.sin(elapsedSec * 5)
}

export function balancedAlarmPulse(elapsedSec: number): number {
  return 1 + 0.16 * Math.sin(elapsedSec * 5)
}
