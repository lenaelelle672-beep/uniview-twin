import { RADIAL_SHADOW_LIFT } from './plan'

/**
 * 工位局部坐标乘 FloorInterior 的世界矩阵，得到贴地圆斑的位置。
 * 只读矩阵元素，不依赖另一份 three，也不写实例矩阵。
 */

export interface DeskXZ {
  id: string
  x: number
  z: number
}

export interface Spot {
  id: string
  x: number
  y: number
  z: number
}

export function applyElements(elements: ArrayLike<number>, x: number, y: number, z: number): { x: number; y: number; z: number } {
  return {
    x: (elements[0] ?? 0) * x + (elements[4] ?? 0) * y + (elements[8] ?? 0) * z + (elements[12] ?? 0),
    y: (elements[1] ?? 0) * x + (elements[5] ?? 0) * y + (elements[9] ?? 0) * z + (elements[13] ?? 0),
    z: (elements[2] ?? 0) * x + (elements[6] ?? 0) * y + (elements[10] ?? 0) * z + (elements[14] ?? 0),
  }
}

/** 场景里还没有室内组时返回 null，调用方过一会儿再读，不造一个原点圆斑。 */
export function interiorElements(scene: { getObjectByName(name: string): unknown } | null): ArrayLike<number> | null {
  if (!scene) return null
  const found = scene.getObjectByName('FloorInterior')
  if (!found || typeof found !== 'object') return null
  const host = found as {
    updateWorldMatrix?: (updateParents: boolean, updateChildren: boolean) => void
    matrixWorld?: { elements?: ArrayLike<number> }
  }
  if (typeof host.updateWorldMatrix !== 'function' || !host.matrixWorld?.elements) return null
  host.updateWorldMatrix(true, false)
  const elements = host.matrixWorld.elements
  if (elements.length < 16) return null
  return elements
}

/**
 * 每个编号都能在本层表里找到才返回。缺一个就整组作废，避免先铺一半再跳。
 * y 是楼板高度再加一点点，圆斑中心落在工位原点。
 */
export function shadowSpots(
  elements: ArrayLike<number> | null,
  desks: readonly DeskXZ[],
  ids: readonly string[],
  lift = RADIAL_SHADOW_LIFT,
): Spot[] | null {
  if (!elements || ids.length === 0) return null
  const byId = new Map(desks.map((desk) => [desk.id, desk]))
  const spots: Spot[] = []
  for (const id of ids) {
    const desk = byId.get(id)
    if (!desk) return null
    const at = applyElements(elements, desk.x, 0, desk.z)
    const spot = { id, x: at.x, y: at.y + lift, z: at.z }
    if (!Number.isFinite(spot.x) || !Number.isFinite(spot.y) || !Number.isFinite(spot.z)) return null
    spots.push(spot)
  }
  return spots
}

export function sameSpots(prev: readonly Spot[] | null, next: readonly Spot[] | null): boolean {
  if (prev === next) return true
  if (!prev || !next || prev.length !== next.length) return false
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index]
    const right = next[index]
    if (!left || !right) return false
    if (left.id !== right.id || left.x !== right.x || left.y !== right.y || left.z !== right.z) return false
  }
  return true
}
