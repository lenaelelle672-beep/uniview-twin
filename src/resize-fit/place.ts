import { floorSpec, isFloorId } from '../data/floors'
import { workstationPosition } from '../scene/stage/workstationPosition'
import type { Vec3 } from './plan'

export interface MatrixElements {
  elements: ArrayLike<number>
}

export interface WorldHost {
  updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void
  matrixWorld: MatrixElements
}

export interface AnchorScene {
  getObjectByName(name: string): WorldHost | undefined
}

/** 只读矩阵元素，不依赖分包里的另一份 three。 */
export function applyMatrixElements(elements: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  const e = elements
  return {
    x: (e[0] ?? 0) * x + (e[4] ?? 0) * y + (e[8] ?? 0) * z + (e[12] ?? 0),
    y: (e[1] ?? 0) * x + (e[5] ?? 0) * y + (e[9] ?? 0) * z + (e[13] ?? 0),
    z: (e[2] ?? 0) * x + (e[6] ?? 0) * y + (e[10] ?? 0) * z + (e[14] ?? 0),
  }
}

export function floorLift(floorId: string): number {
  const rows = typeof window === 'undefined' ? undefined : window.__twinExplode?.floors
  if (!rows) return 0
  return rows.find((floor) => floor.id === floorId)?.offset ?? 0
}

/**
 * 地上层用场景公布的 __twinFloor。
 * 分包如果自己再读图纸缓存，会拿到另一份空表。
 * B1 仍按楼板公式。
 */
function deskLocal(floorId: string, deskId: string): { x: number; z: number } | null {
  const probe = typeof window === 'undefined' ? undefined : window.__twinFloor
  if (probe?.floorId === floorId) {
    const desk = probe.desks.find((item) => item.id === deskId)
    if (desk) return { x: desk.x, z: desk.z }
    return null
  }
  if (floorId !== 'B1') return null
  try {
    const place = workstationPosition(floorId, deskId)
    return { x: place.x, z: place.z }
  } catch {
    return null
  }
}

/** 选中工位的地面落点。演示载体摆在这里，不挂进塔楼，也不改实例矩阵。 */
export function deskAnchor(scene: AnchorScene | null, floorId: string, deskId: string): Vec3 | null {
  if (!scene || !isFloorId(floorId)) return null
  const local = deskLocal(floorId, deskId)
  if (!local) return null
  const interior = scene.getObjectByName('FloorInterior')
  const probe = typeof window === 'undefined' ? undefined : window.__twinFloor
  if (interior && (probe?.floorId === floorId || floorId === 'B1')) {
    interior.updateWorldMatrix(true, false)
    return applyMatrixElements(interior.matrixWorld.elements, local.x, 0, local.z)
  }
  return { x: local.x, y: floorSpec(floorId).elevation + floorLift(floorId), z: local.z }
}
