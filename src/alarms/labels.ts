import type { DeviceStatus, DeviceType } from '../types'

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  pc: '电脑',
  phone: 'IP 电话',
  printer: '打印机',
  camera: '摄像头',
}

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  online: '在线',
  idle: '空闲',
  alarm: '告警',
  offline: '离线',
}

export function deviceTypeLabel(type: DeviceType): string {
  return DEVICE_TYPE_LABEL[type]
}

export function statusLabel(status: DeviceStatus): string {
  return STATUS_LABEL[status]
}
