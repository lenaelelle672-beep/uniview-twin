import type { Desk, Device, DeviceStatus, TwinData, Zone } from '../types'
import { deviceTypeLabel, statusLabel } from './labels'
import { formatAlarmTime, stableEpochMs } from './time'

const ZONE_LABEL: Record<Zone, string> = {
  tower: '塔楼',
  podium: '裙楼',
  east: '右侧楼',
}

export interface FocusDeskInfo {
  id: string
  zoneLabel: string
  personName: string
}

export interface FocusDeviceInfo {
  id: string
  typeLabel: string
  status: DeviceStatus
  statusLabel: string
  time: string
  message: string
}

export interface FocusDetail {
  desk: FocusDeskInfo | null
  device: FocusDeviceInfo | null
}

export function buildFocusDetail(
  data: Pick<TwinData, 'desks' | 'devices' | 'people' | 'alarms'>,
  target: { deskId: string | null; deviceId: string | null },
): FocusDetail | null {
  if (!target.deskId && !target.deviceId) return null

  const found = target.deviceId ? data.devices.find((item) => item.id === target.deviceId) ?? null : null
  const device = found && target.deskId && found.deskId && found.deskId !== target.deskId ? null : found
  const deskId = device?.deskId ?? target.deskId
  const desk = deskId ? data.desks.find((item) => item.id === deskId) ?? null : null
  if (!desk && !device) return null

  return {
    desk: desk ? toDeskInfo(data, desk) : null,
    device: device ? toDeviceInfo(data, device) : null,
  }
}

function toDeskInfo(data: Pick<TwinData, 'people'>, desk: Desk): FocusDeskInfo {
  const names = data.people.filter((person) => person.deskId === desk.id).map((person) => person.name)
  return {
    id: desk.id,
    zoneLabel: ZONE_LABEL[desk.zone],
    personName: names.length > 0 ? names.join('、') : '—',
  }
}

function toDeviceInfo(data: Pick<TwinData, 'alarms'>, device: Device): FocusDeviceInfo {
  const alarm = data.alarms.find((item) => item.deviceId === device.id)
  return {
    id: device.id,
    typeLabel: deviceTypeLabel(device.type),
    status: device.status,
    statusLabel: statusLabel(device.status),
    time: formatAlarmTime(stableEpochMs(device.id)),
    message: alarm?.message ?? `${device.id} ${statusLabel(device.status)}`,
  }
}
