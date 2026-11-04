/**
 * T118：单层平面图俯视的门闩和取景。
 * 正交相机只在会话打开、而且已经进了单层时才挂。
 * 总览、蓝图、首帧之前都不挂，所以它不是首屏相机。
 * CameraControls 仍是透视机位的主人。FloorStageCamera 仍负责单层透视取景。
 * 导览、沿轨、工位爆炸占着镜头时，平面图让开。
 */

export const FLOOR_PLAN_PADDING = 1.12

export interface FloorPlanBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface FloorPlanFrame {
  x: number
  y: number
  z: number
  targetX: number
  targetY: number
  targetZ: number
  upX: 0
  upY: 0
  upZ: -1
  zoom: number
  near: number
  far: number
}

export type FloorPlanReason =
  | 'on'
  | 'off-session'
  | 'off-view'
  | 'off-first-frame'
  | 'yield-tour'
  | 'yield-motion'
  | 'yield-station'

export interface FloorPlanGate {
  session: boolean
  view: string
  firstFrame: boolean
  touring: boolean
  motion: boolean
  station: boolean
}

/** 北是 -Z。正交相机在楼板正上方，屏幕朝上是北。 */
export function frameFloorPlan(box: FloorPlanBox, width: number, height: number): FloorPlanFrame | null {
  if (!(width > 0) || !(height > 0)) return null
  const spanX = box.maxX - box.minX
  const spanZ = box.maxZ - box.minZ
  const numbers = [spanX, spanZ, box.minX, box.maxX, box.minY, box.maxY, box.minZ, box.maxZ]
  if (numbers.some((value) => !Number.isFinite(value))) return null
  if (spanX <= 0 || spanZ <= 0) return null
  const padX = Math.max(spanX, 1) * FLOOR_PLAN_PADDING
  const padZ = Math.max(spanZ, 1) * FLOOR_PLAN_PADDING
  const zoom = Math.min(width / padX, height / padZ)
  if (!Number.isFinite(zoom) || zoom <= 0) return null
  const targetX = (box.minX + box.maxX) / 2
  const targetY = (box.minY + box.maxY) / 2
  const targetZ = (box.minZ + box.maxZ) / 2
  const clearance = Math.max(padX, padZ, 24)
  const y = box.maxY + clearance
  const near = 0.1
  const far = Math.max(y - box.minY + clearance, near + 1)
  return {
    x: targetX,
    y,
    z: targetZ,
    targetX,
    targetY,
    targetZ,
    upX: 0,
    upY: 0,
    upZ: -1,
    zoom,
    near,
    far,
  }
}

export function sameFrame(prev: FloorPlanFrame | null, next: FloorPlanFrame | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  const keys = ['x', 'y', 'z', 'targetX', 'targetY', 'targetZ', 'zoom', 'near', 'far'] as const
  return keys.every((key) => Math.abs(prev[key] - next[key]) < 1e-3)
}

/**
 * 先看会话和视图，再看让路。
 * 总览上即使导览在播，原因也是 off-view，不会去装正交相机。
 */
export function floorPlanReason(gate: FloorPlanGate): FloorPlanReason {
  if (!gate.session) return 'off-session'
  if (!gate.firstFrame) return 'off-first-frame'
  if (gate.view !== 'floor') return 'off-view'
  if (gate.touring) return 'yield-tour'
  if (gate.motion) return 'yield-motion'
  if (gate.station) return 'yield-station'
  return 'on'
}

export function searchOfUrl(url: string): string {
  const query = url.indexOf('?')
  if (query < 0) return ''
  const hash = url.indexOf('#', query)
  return url.slice(query, hash < 0 ? undefined : hash)
}

/** 只认 floorPlan=1。缺省关。不写回地址栏。 */
export function floorPlanBootOn(search: string): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(raw).get('floorPlan') === '1'
}

export function floorPlanBootOnAt(search: string, navigationName: string): boolean {
  return floorPlanBootOn(search) || floorPlanBootOn(searchOfUrl(navigationName))
}

export function acceptsFloorPlanKey(event: {
  key: string
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}): boolean {
  if (event.isComposing || event.repeat || event.altKey || event.metaKey || event.ctrlKey) return false
  if (event.key !== 'p' && event.key !== 'P') return false
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
  if (event.target?.isContentEditable) return false
  return true
}
