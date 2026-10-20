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
