import type { FocusDetail } from '../../alarms/focusDetail'
import { floorSpec } from '../../data/floors'
import { getFloorSlots } from '../../floors/cache'
import { resolveWorkstationRef } from '../../locate/ref'
import { SLAB_M } from '../stage/cut'
import { workstationPosition } from '../stage/workstationPosition'

/**
 * 摘要卡在楼层室内局部坐标里的高度。
 * 镜头看向桌面（局部 y 0.55），屏幕中心约 1.02，状态圆标在 1.88。
 * 卡放在两者之间，跟着工位而不是盖住桌面。
 */
export const FOCUS_FLOAT_LOCAL_Y = 1.72

interface FocusDeviceRef {
  id: string
  deskId?: string | null
}

/**
 * 与 buildFocusDetail 同一套工位取舍：设备工位和当前工位冲突时丢掉设备，退回工位号。
 * 没有工位号的设备（摄像头等）没有图纸落点，不造第二套坐标。
 */
export function focusFloatDeskId(
  devices: readonly FocusDeviceRef[],
  target: { deskId: string | null; deviceId: string | null },
): string | null {
  if (!target.deskId && !target.deviceId) return null
  const found = target.deviceId ? devices.find((item) => item.id === target.deviceId) ?? null : null
  const device = found && target.deskId && found.deskId && found.deskId !== target.deskId ? null : found
  return device?.deskId ?? target.deskId
}

export interface FocusFloatAnchor {
  floorId: string
  deskId: string
  x: number
  y: number
  z: number
}

/**
 * 最多一个锚点。图纸还没进缓存时返回 null，不抛错。
 * y = 层标高 + 楼板厚 + 局部高度，和 FloorInterior 的世界位置对齐。
 */
export function resolveFocusFloatAnchor(
  devices: readonly FocusDeviceRef[],
  target: { deskId: string | null; deviceId: string | null },
): FocusFloatAnchor | null {
  const deskId = focusFloatDeskId(devices, target)
  if (!deskId) return null
  const ref = resolveWorkstationRef(deskId)
  if (!ref) return null
  if (ref.floorId !== 'B1' && !getFloorSlots(ref.floorId)) return null
  let place: { x: number; y: number; z: number }
  try {
    place = workstationPosition(ref.floorId, ref.deskId)
  } catch {
    return null
  }
  return {
    floorId: ref.floorId,
    deskId: ref.deskId,
    x: place.x,
    y: place.y + SLAB_M + FOCUS_FLOAT_LOCAL_Y,
    z: place.z,
  }
}

/** 爆炸只抬外壳。进度数据来自 __twinExplode.floors，没有就当收拢。 */
export function focusFloatLift(floorId: string, floors?: readonly { id: string; offset: number }[]): number {
  if (!floors) return 0
  return floors.find((floor) => floor.id === floorId)?.offset ?? 0
}

export function focusFloatWorld(
  anchor: FocusFloatAnchor,
  lift: number,
): { x: number; y: number; z: number } {
  return { x: anchor.x, y: anchor.y + lift, z: anchor.z }
}

export interface FocusFloatLine {
  role: 'desk' | 'person' | 'device' | 'status'
  text: string
}

/** 侧栏仍是完整详情。这里只留工位、人和设备状态，避免再做一枚全量卡。 */
export function focusFloatLines(detail: FocusDetail): FocusFloatLine[] {
  const lines: FocusFloatLine[] = []
  if (detail.desk) {
    lines.push({ role: 'desk', text: `${detail.desk.id} · ${detail.desk.zoneLabel}` })
    lines.push({ role: 'person', text: detail.desk.personName })
  }
  if (detail.device) {
    lines.push({ role: 'device', text: `${detail.device.typeLabel} · ${detail.device.id}` })
    lines.push({ role: 'status', text: detail.device.statusLabel })
  }
  return lines
}

/** 锚点 y 必须落在该层楼板之上、层高之内，方便单测锁住没有飘到别的层。 */
export function anchorInsideStorey(anchor: FocusFloatAnchor): boolean {
  const spec = floorSpec(anchor.floorId)
  return anchor.y > spec.elevation + SLAB_M && anchor.y < spec.elevation + spec.height
}
