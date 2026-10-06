import type { Device, DeviceStatus } from '../../types'
import { workstationPosition } from './workstationPosition'

export type BadgeShape = 'circle' | 'square' | 'triangle' | 'cross'

export interface StatusGlyph {
  shape: BadgeShape
  color: string
  index: number
}

/** 颜色 + 形状双编码。图集从左到右按 index 排列。 */
export const STATUS_GLYPH: Record<DeviceStatus, StatusGlyph> = {
  online: { shape: 'circle', color: '#2fbf71', index: 0 },
  idle: { shape: 'square', color: '#3d7dff', index: 1 },
  alarm: { shape: 'triangle', color: '#ff4d4f', index: 2 },
  offline: { shape: 'cross', color: '#8d96a3', index: 3 },
}

export const BADGE_Y = 1.88
export const BADGE_SIZE = 0.96

export interface DeviceBadge {
  deskId: string
  status: DeviceStatus
  shape: BadgeShape
  x: number
  z: number
  y: number
}

/**
 * 每个工位一枚圆标，状态跟该工位电脑走。
 * 电话和电脑同工位，不叠第二枚。打印机、摄像头没有工位号，不另造坐标。
 * x/z 只来自 workstationPosition（D027）。
 */
export function deviceBadges(floorId: string, devices: Device[]): DeviceBadge[] {
  const byDesk = new Map<string, DeviceStatus>()
  for (const device of devices) {
    if (device.floorId !== floorId || device.type !== 'pc' || !device.deskId) continue
    byDesk.set(device.deskId, device.status)
  }
  const badges: DeviceBadge[] = []
  for (const [deskId, status] of byDesk) {
    const position = workstationPosition(floorId, deskId)
    const glyph = STATUS_GLYPH[status]
    badges.push({
      deskId,
      status,
      shape: glyph.shape,
      x: position.x,
      z: position.z,
      y: BADGE_Y,
    })
  }
  badges.sort((a, b) => a.deskId.localeCompare(b.deskId, 'en', { numeric: true }))
  return badges
}
