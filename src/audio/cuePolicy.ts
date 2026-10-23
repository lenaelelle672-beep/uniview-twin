/**
 * T054：何时出声。
 * 第一份快照先登记。上下文还锁着时，这批在队告警留到第一次手势，只响一声。
 * 之后新出现的告警 id 再合成一声；焦点改到另一条告警也一声。
 * 同一 id、同一焦点在重复窗内，以及紧凑轮播，都不再响。
 */

export type CueReason = 'enqueue' | 'focus'

/** 任意两声之间的最短间隔。 */
export const CUE_MIN_GAP_MS = 2500

/** 同一条告警焦点在这段时间内再切回来，不再响。 */
export const FOCUS_REPEAT_MS = 30_000

/** 安静间隔内最多承认这么多次焦点切换，挡住大屏轮播。 */
export const FOCUS_BURST_MAX = 2

/** 超过这么久没有新的焦点切换，轮播计数清零。 */
export const FOCUS_QUIET_MS = 8_000

export interface CueMemory {
  heard: ReadonlySet<string>
  focusAt: ReadonlyMap<string, number>
  lastCueAt: number
  primed: boolean
  burst: number
  burstAt: number
  pending: CueReason | null
}

export interface CueWatch {
  now: number
  muted: boolean
  unlocked: boolean
  alarmIds: readonly string[]
  focusKey: string | null
}

export interface CueDecision {
  memory: CueMemory
  play: boolean
  reason: CueReason | null
  /** 有按住的新告警，过这么多毫秒再看一次。未解锁时为 null，等手势。 */
  retryInMs: number | null
}

export interface FocusDeviceRef {
  id: string
  deskId?: string | null
  status: string
}

export interface FocusAlarmRef {
  deviceId: string
}

export function createCueMemory(): CueMemory {
  return {
    heard: new Set(),
    focusAt: new Map(),
    lastCueAt: Number.NEGATIVE_INFINITY,
    primed: false,
    burst: 0,
    burstAt: Number.NEGATIVE_INFINITY,
    pending: null,
  }
}

export function muteAudioFromSearch(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('muteAudio') === '1'
}

function navigationHref(): string | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
  const entry = performance.getEntriesByType('navigation')[0] as { name?: string } | undefined
  return entry?.name ?? null
}

/**
 * `?muteAudio=1`。地址栏同步会把未知参数抹掉，所以同时看导航记录里的原始地址。
 */
export function initialMuteAudio(search?: string, navigationHrefOverride?: string | null): boolean {
  const current = search ?? (typeof location === 'undefined' ? '' : location.search)
  if (muteAudioFromSearch(current)) return true
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  if (!href) return false
  try {
    return muteAudioFromSearch(new URL(href).search)
  } catch {
    return false
  }
}

/** 焦点落在告警设备或告警工位上才返回键。健康工位不响。 */
export function alarmFocusKey(
  focusedDeviceId: string | null,
  focusedDeskId: string | null,
  devices: readonly FocusDeviceRef[],
  alarms: readonly FocusAlarmRef[],
): string | null {
  if (!focusedDeviceId && !focusedDeskId) return null
  const alarmDevices = new Set<string>()
  for (const alarm of alarms) {
    if (alarm.deviceId) alarmDevices.add(alarm.deviceId)
  }
  if (focusedDeviceId) {
    const device = devices.find((item) => item.id === focusedDeviceId)
    if ((device && device.status === 'alarm') || alarmDevices.has(focusedDeviceId)) return `d:${focusedDeviceId}`
    return null
  }
  for (const device of devices) {
    if (device.deskId !== focusedDeskId) continue
    if (device.status === 'alarm' || alarmDevices.has(device.id)) return `w:${focusedDeskId}`
  }
  return null
}

function addHeard(heard: Set<string>, alarmIds: readonly string[]): boolean {
  let added = false
  for (const id of alarmIds) {
    if (!id || heard.has(id)) continue
    heard.add(id)
    added = true
  }
  return added
}

export function watchAlarms(memory: CueMemory, watch: CueWatch): CueDecision {
  const heard = new Set(memory.heard)
  const focusAt = new Map(memory.focusAt)

  if (!memory.primed) {
    const hasAlarm = addHeard(heard, watch.alarmIds)
    if (watch.focusKey) focusAt.set(watch.focusKey, watch.now)
    return {
      play: false,
      reason: null,
      retryInMs: null,
      memory: {
        heard,
        focusAt,
        lastCueAt: memory.lastCueAt,
        primed: true,
        burst: 0,
        burstAt: watch.now,
        pending: hasAlarm && !watch.muted && !watch.unlocked ? 'enqueue' : null,
      },
    }
  }

  const enqueue = addHeard(heard, watch.alarmIds)
  let burst = memory.burst
  let burstAt = memory.burstAt
  let focus = false
  if (watch.focusKey) {
    const seenAt = focusAt.get(watch.focusKey)
    const repeated = seenAt != null && watch.now - seenAt < FOCUS_REPEAT_MS
    if (!repeated) {
      if (watch.now - burstAt > FOCUS_QUIET_MS) burst = 0
      burst += 1
      burstAt = watch.now
      focusAt.set(watch.focusKey, watch.now)
      focus = burst <= FOCUS_BURST_MAX
    }
  } else if (watch.now - burstAt > FOCUS_QUIET_MS) {
    burst = 0
  }

  const cooled = watch.now - memory.lastCueAt >= CUE_MIN_GAP_MS
  let pending = memory.pending
  if (watch.muted) pending = null
  else if (enqueue) pending = 'enqueue'
  else if (focus && (!watch.unlocked || cooled)) pending = pending === 'enqueue' ? 'enqueue' : 'focus'

  const play = pending != null && !watch.muted && watch.unlocked && cooled
  const reason = play ? pending : null
  const lastCueAt = play ? watch.now : memory.lastCueAt
  const nextPending = play ? null : pending
  const retryInMs =
    nextPending != null && !watch.muted && watch.unlocked && !cooled
      ? Math.max(0, memory.lastCueAt + CUE_MIN_GAP_MS - watch.now)
      : null

  return {
    play,
    reason,
    retryInMs,
    memory: {
      heard,
      focusAt,
      lastCueAt,
      primed: true,
      burst,
      burstAt,
      pending: nextPending,
    },
  }
}
