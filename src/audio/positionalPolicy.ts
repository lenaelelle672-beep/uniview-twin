/**
 * T108：空间音何时接过提示音，声源落在哪。
 * 不创建音频上下文，也不碰镜头。
 * `spatial=1` 才打开。`spatial=0` 强制关。`muteAudio=1` 只静音。
 * 地址栏同步会抹掉未知参数，所以同时看导航记录里的原始地址。
 */

import { SLAB_M } from '../scene/stage/cut'
import { alarmFocusKey } from './cuePolicy'
import { resolveWorkstationRef } from '../locate/ref'

/** drei `distance` 写入 PositionalAudio.setRefDistance。工位间距约 2 米。 */
export const ALARM_REF_DISTANCE = 2

/** 声源在楼板顶面之上，大约落在桌面设备高度。 */
export const ALARM_EAR_M = 1.05

export interface SpatialDevice {
  id: string
  floorId: string
  deskId?: string | null
  status: string
}

export interface SpatialAlarm {
  id: string
  deviceId: string
  floorId: string
}

export interface SpatialSource {
  alarms: readonly SpatialAlarm[]
  devices: readonly SpatialDevice[]
  focusedDeviceId: string | null
  focusedDeskId: string | null
}

export interface SpatialAnchor {
  floorId: string
  deskId: string
}

function readFlag(search: string, key: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get(key)
}

function navigationHref(): string | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
  const entry = performance.getEntriesByType('navigation')[0] as { name?: string } | undefined
  return entry?.name ?? null
}

function searches(search?: string, navigationHrefOverride?: string | null): string[] {
  const current = search ?? (typeof location === 'undefined' ? '' : location.search)
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  const list = [current]
  if (!href) return list
  try {
    list.push(new URL(href).search)
  } catch {
    // 导航记录不是合法地址
  }
  return list
}

function anyFlag(list: readonly string[], key: string, value: string): boolean {
  return list.some((item) => readFlag(item, key) === value)
}

/** 默认关。演示模式不顺手打开，避免把现有提示音全部换成空间音。 */
export function initialSpatialEnabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const list = searches(search, navigationHrefOverride)
  if (anyFlag(list, 'spatial', '0')) return false
  return anyFlag(list, 'spatial', '1')
}

/** 打开之后是否先静音。和提示音共用 muteAudio。 */
export function initialSpatialMuted(search?: string, navigationHrefOverride?: string | null): boolean {
  const list = searches(search, navigationHrefOverride)
  return anyFlag(list, 'muteAudio', '1')
}

function anchorFromDesk(deskId: string, floorId: string | null): SpatialAnchor | null {
  const ref = resolveWorkstationRef(deskId)
  if (!ref) return null
  return { floorId: floorId && floorId.length > 0 ? floorId : ref.floorId, deskId: ref.deskId }
}

function anchorFromDevice(device: SpatialDevice | undefined, floorId: string): SpatialAnchor | null {
  if (!device?.deskId) return null
  return anchorFromDesk(device.deskId, floorId || device.floorId)
}

/** 入队落在最新一条能对上工位的告警。焦点落在当前告警设备或告警工位。对不上就返回 null，提示音继续响。 */
export function anchorForReason(reason: 'enqueue' | 'focus', source: SpatialSource): SpatialAnchor | null {
  if (reason === 'focus') {
    const key = alarmFocusKey(source.focusedDeviceId, source.focusedDeskId, source.devices, source.alarms)
    if (!key) return null
    if (key.startsWith('d:')) {
      const deviceId = key.slice(2)
      const device = source.devices.find((item) => item.id === deviceId)
      const alarm = source.alarms.find((item) => item.deviceId === deviceId)
      return anchorFromDevice(device, alarm?.floorId ?? device?.floorId ?? '')
    }
    if (key.startsWith('w:')) return anchorFromDesk(key.slice(2), null)
    return null
  }
  for (let index = source.alarms.length - 1; index >= 0; index -= 1) {
    const alarm = source.alarms[index]
    if (!alarm) continue
    const device = source.devices.find((item) => item.id === alarm.deviceId)
    const anchor = anchorFromDevice(device, alarm.floorId)
    if (anchor) return anchor
  }
  return null
}

/** 世界坐标。y = 层标高 + 楼板厚 + 设备高度 + 爆炸抬升。 */
export function sourcePosition(
  flat: { x: number; z: number },
  elevation: number,
  lift: number,
): { x: number; y: number; z: number } {
  return {
    x: flat.x,
    y: elevation + SLAB_M + ALARM_EAR_M + lift,
    z: flat.z,
  }
}
