import { authorModeOn } from '../author/gate'

/**
 * T080：作者态拖设备 / 家具落点。
 *
 * 只在 ?demoEdit=1 或作者态（debugHelpers）打开。观众默认关。
 * 家具落点和 T077 浅拷是同一组坐标，手柄偏在灯侧，拖的是落点而不是轴柄。
 * 工位公式（D027）不在这里改。Shift 仍是 T052 框选，这道门不收。
 */

export const DRAG_AXIS = 'y' as const

/** 水平面拖。y 锁在落点高度，避免把设备抬进雾里。 */
export const DRAG_X: readonly [number, number] = [-90, 90]
export const DRAG_Z: readonly [number, number] = [-60, 90]

/** 家具手柄相对浅拷原点偏到 +X，免得和灯体重叠抢射线。 */
export const FURNITURE_HANDLE_OFFSET = [2.4, 0.33, 0] as const

export type DragKind = 'device' | 'furniture'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface DragSpot {
  id: string
  kind: DragKind
  handle: readonly [number, number, number]
  /** 家具才有。浅拷组的原始落点，手柄移动量加在这上面。 */
  clone: readonly [number, number, number] | null
}

const FURNITURE_CLONES = [
  { id: 'clone-w', clone: [-8, 0.12, 28] as const },
  { id: 'clone-c', clone: [0, 0.12, 31] as const },
  { id: 'clone-e', clone: [8, 0.12, 28] as const },
] as const

const DEVICE_HANDLES = [
  { id: 'printer-w', handle: [-16, 0.45, 24] as const },
  { id: 'printer-e', handle: [16, 0.45, 24] as const },
  { id: 'camera-s', handle: [0, 1.25, 18] as const },
] as const

export function furnitureHandle(clone: readonly [number, number, number]): readonly [number, number, number] {
  return [clone[0] + FURNITURE_HANDLE_OFFSET[0], clone[1] + FURNITURE_HANDLE_OFFSET[1], clone[2] + FURNITURE_HANDLE_OFFSET[2]]
}

export const DRAG_SPOTS: readonly DragSpot[] = [
  ...DEVICE_HANDLES.map((spot) => ({
    id: spot.id,
    kind: 'device' as const,
    handle: spot.handle,
    clone: null,
  })),
  ...FURNITURE_CLONES.map((spot) => ({
    id: spot.id,
    kind: 'furniture' as const,
    handle: furnitureHandle(spot.clone),
    clone: spot.clone,
  })),
]

/** 和 T077 的三盏浅拷对齐。测试用来卡住两处坐标分叉。 */
export const FURNITURE_CLONE_SEEDS = FURNITURE_CLONES

export function dragSpot(id: string): DragSpot | undefined {
  return DRAG_SPOTS.find((spot) => spot.id === id)
}

export function handleOf(spot: DragSpot): Vec3 {
  return { x: spot.handle[0], y: spot.handle[1], z: spot.handle[2] }
}

export function dragLimitsFor(y: number): [[number, number], [number, number], [number, number]] {
  return [[DRAG_X[0], DRAG_X[1]], [y, y], [DRAG_Z[0], DRAG_Z[1]]]
}

export function insideDragLimits(position: Vec3, yLock: number): boolean {
  const [x, y, z] = dragLimitsFor(yLock)
  return position.x >= x[0] && position.x <= x[1] && position.y >= y[0] && position.y <= y[1] && position.z >= z[0] && position.z <= z[1]
}

/**
 * 家具浅拷跟着手柄的水平位移走，高度留在浅拷原点。
 * 设备没有浅拷，调用方不要传空的 clone。
 */
export function cloneFromHandle(handle: Vec3, seedHandle: Vec3, seedClone: readonly [number, number, number]): Vec3 {
  return {
    x: seedClone[0] + (handle.x - seedHandle.x),
    y: seedClone[1],
    z: seedClone[2] + (handle.z - seedHandle.z),
  }
}

export function readMatrixPosition(matrix: { elements: ArrayLike<number> }): Vec3 {
  return {
    x: matrix.elements[12] ?? 0,
    y: matrix.elements[13] ?? 0,
    z: matrix.elements[14] ?? 0,
  }
}

export function movedCount(places: ReadonlyMap<string, Vec3>): number {
  let count = 0
  for (const spot of DRAG_SPOTS) {
    const place = places.get(spot.id)
    if (!place) continue
    const seed = handleOf(spot)
    if (Math.abs(place.x - seed.x) > 1e-3 || Math.abs(place.y - seed.y) > 1e-3 || Math.abs(place.z - seed.z) > 1e-3) {
      count += 1
    }
  }
  return count
}

/** 地址栏、启动地址或作者态。本页开关优先。默认关。 */
export function dragEnabled(override: boolean | null, search: string, navigation = '', layers?: object | null): boolean {
  if (override != null) return override
  return authorModeOn({ search, navigation, layers })
}

/**
 * T052 框选是 Shift。左键且没有 Shift 才拖落点。
 * 右键和中键留给镜头，不在这里接。
 */
export function dragAcceptsPointer(event: { shiftKey: boolean; button: number }): boolean {
  return event.button === 0 && !event.shiftKey
}

export function eventTargetsCanvas(event: { target: unknown }, canvas: unknown): boolean {
  const target = event.target
  if (target == null || canvas == null) return false
  if (target === canvas) return true
  return typeof Node !== 'undefined' && target instanceof Node && canvas instanceof Node && canvas.contains(target)
}

export function closestHitIsPlacement(objects: readonly { userData?: { dragPlacement?: boolean } }[]): boolean {
  return objects[0]?.userData?.dragPlacement === true
}
