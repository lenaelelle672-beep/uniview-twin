/**
 * DEMO 合成告警时间序列。
 *
 * 仓库没有真实告警历史事件流（D538）。现网 Alarm 只有 id / deviceId / floorId / message。
 * alarms/time.ts 里的时刻是设备号散列出来的演示时间，不是出现/恢复。
 * 本文件的 appearMs / clearMs 全部是合成的，只给时间轴回放。
 * 游标落到「现在」时调用方应丢掉这一帧，3D 继续读现网快照。
 */
import type { Alarm, Device } from '../types'

/** 与 alarms/time.ts 的 DEMO_END_MS 同一时刻：2026-09-28 18:00（东八区）。 */
export const DEMO_NOW_MS = Date.UTC(2026, 8, 28, 10, 0, 0)

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000

/** 回放窗口：现在往前 8 小时。 */
export const DEMO_WINDOW_MS = 8 * HOUR_MS

/** 滑条一步一分钟，采样点都落在整分钟上。 */
export const DEMO_STEP_MS = MINUTE_MS

/** 每层最多造这么多条已恢复的电脑告警，避免一进中段就把 12 个描边名额占满。 */
export const DEMO_HISTORY_PER_FLOOR = 3

/**
 * 现网仍在告警的电脑，按工位号在本层排队后分成三档出现时间。
 * 前 3 台 7 小时 30 分前出现，接着 4 台 4 小时前出现，其余 21 分钟前出现。
 * 最晚一档早于「现在」前一分钟；最早一档晚于窗口起点（8 小时前）。
 */
const EARLY_COUNT = 3
const MID_COUNT = 4
const AGE_EARLY_MS = 7 * HOUR_MS + 30 * MINUTE_MS
const AGE_MID_MS = 4 * HOUR_MS
const AGE_LATE_MS = 21 * MINUTE_MS

/** 已恢复历史：6 小时 48 分前出现，4 小时 48 分前恢复。 */
const HISTORY_APPEAR_AGE_MS = 6 * HOUR_MS + 48 * MINUTE_MS
const HISTORY_CLEAR_AGE_MS = 4 * HOUR_MS + 48 * MINUTE_MS

export const DEMO_SAMPLE = {
  startMs: DEMO_NOW_MS - DEMO_WINDOW_MS,
  withHistoryMs: DEMO_NOW_MS - (6 * HOUR_MS + 30 * MINUTE_MS),
  partialMs: DEMO_NOW_MS - 3 * HOUR_MS,
  almostNowMs: DEMO_NOW_MS - MINUTE_MS,
} as const

export interface DemoAlarmSpan {
  id: string
  deviceId: string
  floorId: string
  deskId: string
  appearMs: number
  /** null 表示到演示截止仍未恢复。 */
  clearMs: number | null
  /** 电脑工位才进多描边。电话等只参与热力读数。 */
  outlines: boolean
  message: string
}

export interface DemoPlaybackFrame {
  cursorMs: number
  alarmDeskIds: string[]
  alarms: Alarm[]
}

function byDesk(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true })
}

/** 东八区，格式与 alarms/time.ts 的 formatAlarmTime 一致。 */
export function formatDemoClock(epochMs: number): string {
  const shifted = new Date(epochMs + 8 * HOUR_MS)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hour = String(shifted.getUTCHours()).padStart(2, '0')
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function livePcAlarmDeskIds(devices: readonly Device[]): string[] {
  const ids = new Set<string>()
  for (const device of devices) {
    if (device.type !== 'pc' || device.status !== 'alarm' || !device.deskId) continue
    ids.add(device.deskId)
  }
  return [...ids].sort(byDesk)
}

export function buildDemoSpans(devices: readonly Device[], alarms: readonly Alarm[]): DemoAlarmSpan[] {
  const alarmByDevice = new Map<string, Alarm>()
  for (const alarm of alarms) {
    if (!alarmByDevice.has(alarm.deviceId)) alarmByDevice.set(alarm.deviceId, alarm)
  }

  const spans: DemoAlarmSpan[] = []
  const pushLive = (device: Device, ageMs: number, outlines: boolean) => {
    if (!device.deskId) return
    const alarm = alarmByDevice.get(device.id)
    spans.push({
      id: alarm?.id ?? `DEMO-LIVE-${device.id}`,
      deviceId: device.id,
      floorId: device.floorId,
      deskId: device.deskId,
      appearMs: DEMO_NOW_MS - ageMs,
      clearMs: null,
      outlines,
      message: alarm?.message ?? `${device.id} 告警`,
    })
  }

  const pcsByFloor = new Map<string, Device[]>()
  for (const device of devices) {
    if (!device.deskId || device.status !== 'alarm') continue
    if (device.type !== 'pc') {
      pushLive(device, AGE_LATE_MS, false)
      continue
    }
    const list = pcsByFloor.get(device.floorId) ?? []
    list.push(device)
    pcsByFloor.set(device.floorId, list)
  }
  for (const list of pcsByFloor.values()) {
    list.sort((left, right) => byDesk(left.deskId ?? '', right.deskId ?? ''))
    list.forEach((device, index) => {
      const age = index < EARLY_COUNT ? AGE_EARLY_MS : index < EARLY_COUNT + MID_COUNT ? AGE_MID_MS : AGE_LATE_MS
      pushLive(device, age, true)
    })
  }

  const recoveredByFloor = new Map<string, Device[]>()
  for (const device of devices) {
    if (device.type !== 'pc' || !device.deskId || device.status === 'alarm' || device.status === 'offline') continue
    const list = recoveredByFloor.get(device.floorId) ?? []
    list.push(device)
    recoveredByFloor.set(device.floorId, list)
  }
  for (const list of recoveredByFloor.values()) {
    list.sort((left, right) => byDesk(left.deskId ?? '', right.deskId ?? ''))
    for (const device of list.slice(0, DEMO_HISTORY_PER_FLOOR)) {
      if (!device.deskId) continue
      spans.push({
        id: `DEMO-${device.id}`,
        deviceId: device.id,
        floorId: device.floorId,
        deskId: device.deskId,
        appearMs: DEMO_NOW_MS - HISTORY_APPEAR_AGE_MS,
        clearMs: DEMO_NOW_MS - HISTORY_CLEAR_AGE_MS,
        outlines: true,
        message: `DEMO ${device.id} 历史告警`,
      })
    }
  }
  return spans
}

/** 游标 >= 现在时返回 null，调用方改读现网快照。 */
export function frameFromSpans(spans: readonly DemoAlarmSpan[], cursorMs: number): DemoPlaybackFrame | null {
  if (cursorMs >= DEMO_NOW_MS) return null
  const deskIds = new Set<string>()
  const rows: Alarm[] = []
  for (const span of spans) {
    if (span.appearMs > cursorMs) continue
    if (span.clearMs != null && span.clearMs <= cursorMs) continue
    if (span.outlines) deskIds.add(span.deskId)
    rows.push({
      id: span.id,
      deviceId: span.deviceId,
      floorId: span.floorId,
      message: span.message,
    })
  }
  rows.sort((left, right) => left.id.localeCompare(right.id, 'en'))
  return {
    cursorMs,
    alarmDeskIds: [...deskIds].sort(byDesk),
    alarms: rows,
  }
}

export function playbackAt(devices: readonly Device[], alarms: readonly Alarm[], cursorMs: number): DemoPlaybackFrame | null {
  return frameFromSpans(buildDemoSpans(devices, alarms), cursorMs)
}
