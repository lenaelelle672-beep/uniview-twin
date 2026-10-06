import type { QualityTier } from '../types'

export type FrameChannel = 'motion' | 'people' | 'alarm'

/** 性能档：连续动画 30 fps、人物 10 fps、告警 2 Hz。均衡/高档不限。 */
export const CHANNEL_HZ: Record<FrameChannel, Record<QualityTier, number>> = {
  motion: { perf: 30, balanced: Number.POSITIVE_INFINITY, high: Number.POSITIVE_INFINITY },
  people: { perf: 10, balanced: Number.POSITIVE_INFINITY, high: Number.POSITIVE_INFINITY },
  alarm: { perf: 2, balanced: Number.POSITIVE_INFINITY, high: Number.POSITIVE_INFINITY },
}

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

export function anyChannelHeld(): boolean {
  return holds.motion > 0 || holds.people > 0 || holds.alarm > 0
}

export function channelIntervalMs(channel: FrameChannel, quality: QualityTier): number {
  const hz = CHANNEL_HZ[channel][quality]
  if (!Number.isFinite(hz) || hz <= 0) return 0
  return 1000 / hz
}

/** intervalMs=0 表示不限帧。 */
export function channelDue(lastMs: number, nowMs: number, intervalMs: number): boolean {
  if (intervalMs <= 0) return true
  return nowMs - lastMs >= intervalMs
}

export function nextChannelDelay(lastMs: number, nowMs: number, intervalMs: number): number {
  if (intervalMs <= 0) return 0
  return Math.max(0, intervalMs - (nowMs - lastMs))
}

export type ChannelClock = Record<FrameChannel, number>

export function emptyChannelClock(): ChannelClock {
  return { motion: 0, people: 0, alarm: 0 }
}

/**
 * 最近一次该醒来的延迟（毫秒）。
 * Infinity = 没有续帧源；0 = 立刻再要一帧（不限帧）。
 * hidden 时永不续帧。
 */
export function soonestWakeMs(last: ChannelClock, quality: QualityTier, now: number, hidden: boolean): number {
  if (hidden) return Number.POSITIVE_INFINITY
  let soonest = Number.POSITIVE_INFINITY
  for (const channel of CHANNELS) {
    if (holds[channel] <= 0) continue
    soonest = Math.min(soonest, nextChannelDelay(last[channel], now, channelIntervalMs(channel, quality)))
  }
  return soonest
}

export function markDueChannels(last: ChannelClock, quality: QualityTier, now: number): void {
  for (const channel of CHANNELS) {
    if (holds[channel] <= 0) continue
    if (channelDue(last[channel], now, channelIntervalMs(channel, quality))) last[channel] = now
  }
}

/** 性能档 2 Hz 离散亮灭。偶数半周期亮。 */
export function discreteAlarmLit(elapsedSec: number): boolean {
  return Math.floor(elapsedSec * 2) % 2 === 0
}

/** 均衡档现状：sin(t*5) 脉冲。 */
export function balancedAlarmGlow(elapsedSec: number): number {
  return 0.78 + 0.22 * Math.sin(elapsedSec * 5)
}

export function balancedAlarmPulse(elapsedSec: number): number {
  return 1 + 0.16 * Math.sin(elapsedSec * 5)
}
