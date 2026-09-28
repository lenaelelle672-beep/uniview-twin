import type { AlarmFloorRange } from '../store/filterSlice'
import type { Alarm, Device, DeviceStatus, Floor, TwinData } from '../types'
import { isFloorId } from '../data/floors'
import { deviceTypeLabel, statusLabel } from './labels'
import { formatAlarmTime, stableEpochMs } from './time'

export interface AlarmListRow {
  id: string
  floorId: string
  deskId: string | null
  deviceId: string
  deviceType: Device['type']
  status: DeviceStatus
  time: string
  message: string
}

export interface BuildingSummary {
  floorCount: number
  deskCount: number
  deviceCount: number
  peopleCount: number
  alarmCount: number
  offlineCount: number
}

const STATUS_ORDER: DeviceStatus[] = ['alarm', 'offline', 'idle', 'online']

export function floorLevel(id: string): number {
  if (id === 'B1') return -1
  const level = Number(id.slice(1))
  return Number.isFinite(level) ? level : 999
}

/** 未选择状态时只显示告警，使列表条数与侧栏告警徽标一致。 */
export function effectiveStatuses(statusFilter: readonly DeviceStatus[]): DeviceStatus[] {
  if (statusFilter.length === 0) return ['alarm']
  return STATUS_ORDER.filter((status) => statusFilter.includes(status))
}

export function rangeBounds(range: AlarmFloorRange | null): { lo: number; hi: number } | null {
  if (!range || !isFloorId(range.start) || !isFloorId(range.end)) return null
  const start = floorLevel(range.start)
  const end = floorLevel(range.end)
  return { lo: Math.min(start, end), hi: Math.max(start, end) }
}

export function floorInRange(floorId: string, range: AlarmFloorRange | null): boolean {
  const bounds = rangeBounds(range)
  if (!bounds) return true
  const level = floorLevel(floorId)
  return level >= bounds.lo && level <= bounds.hi
}

export function deskCell(row: Pick<AlarmListRow, 'deskId'>): string {
  return row.deskId ?? '—'
}

export function deviceCell(row: Pick<AlarmListRow, 'deviceType' | 'deviceId'>): string {
  return `${deviceTypeLabel(row.deviceType)} · ${row.deviceId}`
}

export function statusCell(row: Pick<AlarmListRow, 'status'>): string {
  return statusLabel(row.status)
}

export function buildExceptionRows(data: Pick<TwinData, 'devices' | 'alarms'>): AlarmListRow[] {
  const alarmByDevice = new Map<string, Alarm>()
  for (const alarm of data.alarms) {
    if (!alarmByDevice.has(alarm.deviceId)) alarmByDevice.set(alarm.deviceId, alarm)
  }

  const rows: AlarmListRow[] = []
  for (const device of data.devices) {
    if (device.status !== 'alarm' && device.status !== 'offline') continue
    const alarm = alarmByDevice.get(device.id)
    rows.push({
      id: alarm?.id ?? device.id,
      floorId: device.floorId,
      deskId: device.deskId ?? null,
      deviceId: device.id,
      deviceType: device.type,
      status: device.status,
      time: formatAlarmTime(stableEpochMs(device.id)),
      message: alarm?.message ?? `${device.id} ${device.status === 'alarm' ? '告警' : '离线'}`,
    })
  }

  rows.sort((left, right) => {
    const byFloor = floorLevel(left.floorId) - floorLevel(right.floorId)
    if (byFloor !== 0) return byFloor
    const byDesk = (left.deskId ?? '').localeCompare(right.deskId ?? '', 'en')
    if (byDesk !== 0) return byDesk
    return left.deviceId.localeCompare(right.deviceId, 'en')
  })
  return rows
}

export function filterAlarmRows(
  rows: readonly AlarmListRow[],
  range: AlarmFloorRange | null,
  statusFilter: readonly DeviceStatus[],
): AlarmListRow[] {
  const statuses = effectiveStatuses(statusFilter)
  return rows.filter((row) => statuses.includes(row.status) && floorInRange(row.floorId, range))
}

export function alarmBadgeSum(floors: readonly Floor[], range: AlarmFloorRange | null): number {
  return floors.reduce((sum, floor) => (floorInRange(floor.id, range) ? sum + floor.alarmCount : sum), 0)
}

export function offlineBadgeSum(floors: readonly Floor[], range: AlarmFloorRange | null): number {
  return floors.reduce((sum, floor) => (floorInRange(floor.id, range) ? sum + floor.offlineCount : sum), 0)
}

export function buildingSummary(data: Pick<TwinData, 'floors' | 'desks' | 'devices' | 'people'>): BuildingSummary {
  let alarmCount = 0
  let offlineCount = 0
  for (const floor of data.floors) {
    alarmCount += floor.alarmCount
    offlineCount += floor.offlineCount
  }
  return {
    floorCount: data.floors.length,
    deskCount: data.desks.length,
    deviceCount: data.devices.length,
    peopleCount: data.people.length,
    alarmCount,
    offlineCount,
  }
}

export function rangeLabel(range: AlarmFloorRange | null): string {
  const bounds = rangeBounds(range)
  if (!range || !bounds) return '全部楼层'
  return `${range.start}~${range.end}`
}

export function statusFilterLabel(statusFilter: readonly DeviceStatus[]): string {
  return effectiveStatuses(statusFilter).map((status) => statusLabel(status)).join('、')
}
