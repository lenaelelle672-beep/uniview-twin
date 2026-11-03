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

/**
 * 桌 ∪ 显示器的局部包围盒。数字对着 geometry 的 boundingBox，单测锁住。
 * 不从这里 import 几何：Host 在 DemandLoop 里，几何留在聚焦卡那个懒包外。
 * 椅子 z 会伸到 0.87，并进去角会飘在椅背外，所以不并。
 */
export const FOCUS_FLOAT_BOUNDS = {
  min: [-0.7, 0, -0.35] as [number, number, number],
  max: [0.7, 1.171802878, 0.35] as [number, number, number],
}

/**
 * 正 X、正 Y、正 Z。顶角贴在显示器上沿，不盖住桌面中心。
 * drei 文档的盒子示例也是这一角。
 */
export const FOCUS_FLOAT_CORNER: [number, number, number] = [1, 1, 1]

export interface FocusFloatBox {
  center: [number, number, number]
  size: [number, number, number]
}

export interface FocusFloatAnchor {
  floorId: string
  deskId: string
  x: number
  /** 层标高 + 楼板 + 局部 1.72。侧栏和旧锚点测试仍读它；卡的位置改由包围盒角决定。 */
  y: number
  z: number
  /** 工位绕 Y 的转角。先把包围盒转到这个朝向，再交给 BBAnchor。 */
  rot: number
  /** 桌面网格局部原点的世界高度：层标高 + 楼板。锚组放在这里。 */
  originY: number
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
  let place: { x: number; y: number; z: number; rot: number }
  try {
    place = workstationPosition(ref.floorId, ref.deskId)
  } catch {
    return null
  }
  const originY = place.y + SLAB_M
  return {
    floorId: ref.floorId,
    deskId: ref.deskId,
    x: place.x,
    y: originY + FOCUS_FLOAT_LOCAL_Y,
    z: place.z,
    rot: place.rot,
    originY,
  }
}

/**
 * 绕 Y 转过工位朝向后的轴对齐包围盒。
 * BBAnchor 用世界尺寸往父级局部轴上加，父级一带旋转尺寸就会串轴。
 * 所以旋转烤进这只盒子，父级保持不转。
 */
export function focusFloatCornerBox(rot: number): FocusFloatBox {
  const [minX, minY, minZ] = FOCUS_FLOAT_BOUNDS.min
  const [maxX, maxY, maxZ] = FOCUS_FLOAT_BOUNDS.max
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const x of [minX, maxX]) {
    for (const z of [minZ, maxZ]) {
      const rx = x * c - z * s
      const rz = x * s + z * c
      if (rx < x0) x0 = rx
      if (rx > x1) x1 = rx
      if (rz < z0) z0 = rz
      if (rz > z1) z1 = rz
    }
  }
  return {
    center: [(x0 + x1) / 2, (minY + maxY) / 2, (z0 + z1) / 2],
    size: [x1 - x0, maxY - minY, z1 - z0],
  }
}

/**
 * drei 10.7.9 BBAnchor 的落点：parent.position + size * anchor / 2。
 * 父级放在包围盒中心、几何以原点为中心时，[1,1,1] 就是轴对齐包围盒的最大角。
 */
export function focusFloatCornerLocal(
  box: FocusFloatBox,
  anchor: readonly [number, number, number] = FOCUS_FLOAT_CORNER,
): [number, number, number] {
  return [
    box.center[0] + (box.size[0] * anchor[0]) / 2,
    box.center[1] + (box.size[1] * anchor[1]) / 2,
    box.center[2] + (box.size[2] * anchor[2]) / 2,
  ]
}

/** 爆炸只抬外壳。进度数据来自 __twinExplode.floors，没有就当收拢。 */
export function focusFloatLift(floorId: string, floors?: readonly { id: string; offset: number }[]): number {
  if (!floors) return 0
  return floors.find((floor) => floor.id === floorId)?.offset ?? 0
}

export interface ExplodeShift {
  x: number
  y: number
  z: number
}

function twinWindow(): Window | undefined {
  return (globalThis as { window?: Window }).window
}

/**
 * 炸开时的锚位移。
 * 工位分包装过徽标钩子时，读那一份时钟：楼层抬升和工位平移都在里面。
 * 钩子还没装，就只加外壳已经写进 __twinExplode.floors 的偏移。
 * 浮动卡不挂在楼层组上，inheritFloorLift 传 false，竖直只抬一次。
 */
export function focusFloatExplodeShift(floorId: string, x: number, z: number): ExplodeShift {
  const root = twinWindow()
  const hooked = root?.__twinBadgeExplodeDelta
  if (typeof hooked === 'function') return hooked(floorId, x, z, false)
  return { x: 0, y: focusFloatLift(floorId, root?.__twinExplode?.floors), z: 0 }
}

/** 锚组世界位置：工位原点 + 爆炸位移。包围盒角是组内的局部偏移，不重复加。 */
export function focusFloatGroupPosition(
  anchor: FocusFloatAnchor,
  shift: ExplodeShift,
): { x: number; y: number; z: number } {
  return {
    x: anchor.x + shift.x,
    y: anchor.originY + shift.y,
    z: anchor.z + shift.z,
  }
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
