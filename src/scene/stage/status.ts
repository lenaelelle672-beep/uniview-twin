import { Color } from 'three'
import type { Device, DeviceStatus } from '../../types'

export const STATUS_COLOR: Record<DeviceStatus, Color> = {
  online: new Color('#2fbf71'),
  idle: new Color('#3d7dff'),
  alarm: new Color('#ff4d4f'),
  offline: new Color('#a8b0ba'),
}

export function pcStatusOf(devices: Device[], deskId: string): DeviceStatus {
  for (const device of devices) {
    if (device.deskId === deskId && device.type === 'pc') return device.status
  }
  return 'offline'
}
