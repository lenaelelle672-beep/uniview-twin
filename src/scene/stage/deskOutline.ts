import type { BufferGeometry } from 'three'
import type { Device, DeviceType } from '../../types'
import { resolveWorkstationRef } from '../../locate/ref'
import { deskGeometry, monitorGeometry } from './geometry'
import { workstationPosition } from './workstationPosition'

/**
 * drei 10.7.9 `<Outlines screenspace>` 的顶点着色器在 screenspace 为真时
 * 沿法线挤出 thickness（米），得到屏幕里看得见的三维外壳。
 * 工位镜头大约 9m、FOV 42°，0.08m 大约 10 像素，桌面轮廓清楚。
 */
export const DESK_OUTLINE_COLOR = '#3df0ff'
export const DESK_OUTLINE_THICKNESS = 0.08

/**
 * 承载 mesh 放到相机不画的层。
 * 0 主场景，1 拾取体，2 显示器，3 深度代理。描边子网格仍留在 0 层。
 */
export const OUTLINE_CARRIER_LAYER = 4

/** 打印机 / 摄像头没有独立可挂网格，圆标是 InstancedMesh，不能当 Outlines 父级。 */
const MONITOR_DEVICE_TYPES = new Set<DeviceType>(['pc', 'phone'])

export interface DeskOutlinePose {
  x: number
  z: number
  rot: number
}

export interface DeskOutlineShell {
  name: 'DeskOutline' | 'DeviceOutline'
  geometry: BufferGeometry
  pose: DeskOutlinePose
}

/**
 * 进层后的多工位描边封顶。
 * 方案区间是 8～12。取 12：搜索列表本身最多 10 条，8 会在告警稍多时把搜索挤没；
 * 12 仍把 draw call 增量关在固定上界里。
 */
export const MULTI_OUTLINE_CAP = 12

/** 与状态圆标三角红一致，和聚焦青 `#3df0ff` 分开。 */
export const ALARM_OUTLINE_COLOR = '#ff4d4f'

/**
 * 搜索命中的次级色。
 * 不沿用告警红，也不用聚焦青，进层后两种多描边能分开看。
 */
export const SEARCH_OUTLINE_COLOR = '#faad14'

/** 与 SearchBox 当前列表的 limit 一致。多出来的命中不描。 */
export const SEARCH_OUTLINE_HIT_LIMIT = 10

export interface OutlineSearchHit {
  deskId: string
  floorId: string
}

export interface MultiOutlineShell {
  name: 'AlarmOutline' | 'SearchOutline'
  deskId: string
  geometry: BufferGeometry
  pose: DeskOutlinePose
  color: string
}

export function deskOutlinePose(floorId: string, focusedDeskId: string | null): DeskOutlinePose | null {
  if (!focusedDeskId) return null
  const target = resolveWorkstationRef(focusedDeskId)
  if (!target || target.floorId !== floorId) return null
  const place = workstationPosition(floorId, target.deskId)
  return { x: place.x, z: place.z, rot: place.rot }
}

/** 有工位号的电脑 / 电话才有显示器网格。没有落点的设备不挂描边。 */
export function deviceOutlinePose(
  floorId: string,
  focusedDeviceId: string | null,
  devices: readonly Device[],
): DeskOutlinePose | null {
  if (!focusedDeviceId) return null
  const device = devices.find((item) => item.id === focusedDeviceId)
  if (!device || device.floorId !== floorId || !device.deskId) return null
  if (!MONITOR_DEVICE_TYPES.has(device.type)) return null
  return deskOutlinePose(floorId, device.deskId)
}

export function focusedOutlineShells(
  floorId: string,
  focusedDeskId: string | null,
  focusedDeviceId: string | null,
  devices: readonly Device[],
): DeskOutlineShell[] {
  const shells: DeskOutlineShell[] = []
  const desk = deskOutlinePose(floorId, focusedDeskId)
  if (desk) shells.push({ name: 'DeskOutline', geometry: deskGeometry, pose: desk })
  const device = deviceOutlinePose(floorId, focusedDeviceId, devices)
  if (device) shells.push({ name: 'DeviceOutline', geometry: monitorGeometry, pose: device })
  return shells
}

/**
 * 本层告警工位，再接当前搜索命中。
 * 工位状态跟电脑走（圆标 / 蓝图同一套）。打印机、摄像头没有可挂网格，不进列表。
 * 正在聚焦的工位留给青色 DeskOutline，这里跳过，避免两套壳叠在同一张桌面上。
 * 告警先占名额，搜索用剩下的，一共不超过 cap。
 */
export function multiOutlineShells(
  floorId: string,
  devices: readonly Device[],
  searchHits: readonly OutlineSearchHit[],
  focusedDeskId: string | null,
  cap = MULTI_OUTLINE_CAP,
): MultiOutlineShell[] {
  const focused = focusedDeskOnFloor(floorId, focusedDeskId)
  const alarms = alarmDeskIds(floorId, devices)
  const alarmSet = new Set(alarms)
  const searches = searchDeskIds(floorId, searchHits, alarmSet)
  const shells: MultiOutlineShell[] = []
  const push = (deskId: string, role: 'alarm' | 'search') => {
    if (shells.length >= cap || deskId === focused) return
    const pose = deskOutlinePose(floorId, deskId)
    if (!pose) return
    shells.push({
      name: role === 'alarm' ? 'AlarmOutline' : 'SearchOutline',
      deskId,
      geometry: deskGeometry,
      pose,
      color: role === 'alarm' ? ALARM_OUTLINE_COLOR : SEARCH_OUTLINE_COLOR,
    })
  }
  for (const deskId of alarms) push(deskId, 'alarm')
  for (const deskId of searches) push(deskId, 'search')
  return shells
}

function focusedDeskOnFloor(floorId: string, focusedDeskId: string | null): string | null {
  if (!focusedDeskId) return null
  const target = resolveWorkstationRef(focusedDeskId)
  if (!target || target.floorId !== floorId) return null
  if (!deskOutlinePose(floorId, target.deskId)) return null
  return target.deskId
}

/** 只认本层电脑告警。同一工位多条记录只留一次，按工位号稳定排序。 */
function alarmDeskIds(floorId: string, devices: readonly Device[]): string[] {
  const ids = new Set<string>()
  for (const device of devices) {
    if (device.floorId !== floorId || device.type !== 'pc' || device.status !== 'alarm' || !device.deskId) continue
    ids.add(device.deskId)
  }
  return [...ids].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
}

/** 保持搜索列表的原顺序。已经算作告警的工位不再占第二个名额。 */
function searchDeskIds(
  floorId: string,
  searchHits: readonly OutlineSearchHit[],
  blocked: ReadonlySet<string>,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const hit of searchHits) {
    if (hit.floorId !== floorId || blocked.has(hit.deskId) || seen.has(hit.deskId)) continue
    seen.add(hit.deskId)
    ids.push(hit.deskId)
  }
  return ids
}
