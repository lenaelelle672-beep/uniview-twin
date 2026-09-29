import { Color } from 'three'
import type { Device, DeviceStatus } from '../../types'

/** 与三维显示器同一套状态色。蓝图直接用十六进制，避免再引入一套色值。 */
export const STATUS_HEX: Record<DeviceStatus, string> = {
  online: '#2fbf71',
  idle: '#3d7dff',
  alarm: '#ff4d4f',
  offline: '#a8b0ba',
}

/** 颜色加形状：在线圆、空闲方、告警三角、离线叉。蓝图和三维共用这一套。 */
export const STATUS_SHAPE: Record<DeviceStatus, 'circle' | 'square' | 'triangle' | 'cross'> = {
  online: 'circle',
  idle: 'square',
  alarm: 'triangle',
  offline: 'cross',
}

export const STATUS_COLOR: Record<DeviceStatus, Color> = {
  online: new Color(STATUS_HEX.online),
  idle: new Color(STATUS_HEX.idle),
  alarm: new Color(STATUS_HEX.alarm),
  offline: new Color(STATUS_HEX.offline),
}

export function pcStatusOf(devices: Device[], deskId: string): DeviceStatus {
  for (const device of devices) {
    if (device.deskId === deskId && device.type === 'pc') return device.status
  }
  return 'offline'
}
