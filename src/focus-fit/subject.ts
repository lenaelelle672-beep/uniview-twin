import { BufferGeometry, Float32BufferAttribute, Matrix4, Object3D, Vector3 } from 'three'
import { floorSpec } from '../data/floors'
import { workstationPosition } from '../scene/stage/workstationPosition'
import type { FocusPlan } from './plan'

const DESK_HALF_X = 0.7
const DESK_HALF_Z = 0.7
const DESK_HEIGHT = 1.2

type WithGeometry = Object3D & { geometry?: BufferGeometry }

export interface SceneLookup {
  getObjectByName: (name: string) => Object3D | undefined
}

const corner = new Vector3()

export function floorLift(floorId: string): number {
  const rows = typeof window === 'undefined' ? undefined : window.__twinExplode?.floors
  if (!rows) return 0
  return rows.find((floor) => floor.id === floorId)?.offset ?? 0
}

/**
 * 地上层坐标用场景公布的 __twinFloor。
 * 对焦分包如果自己再读图纸缓存，会拿到另一份空表，工位就被当成不存在。
 * B1 仍按楼板公式，不依赖那份缓存。
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

function placementMatrix(scene: SceneLookup, floorId: string): Matrix4 {
  const basis = new Matrix4()
  const interior = scene.getObjectByName('FloorInterior')
  const probe = typeof window === 'undefined' ? undefined : window.__twinFloor
  if (interior && (probe?.floorId === floorId || floorId === 'B1')) {
    interior.updateWorldMatrix(true, false)
    basis.copy(interior.matrixWorld)
    return basis
  }
  basis.makeTranslation(0, floorSpec(floorId).elevation + floorLift(floorId), 0)
  return basis
}

/**
 * 选中物是独立的测量代理，不挂进塔楼。
 * 当前层只返回场景里已经存在的室内 / 楼板 / 外壳，找不到就放弃。
 */
export function resolveFocusObject(scene: SceneLookup | null, plan: FocusPlan): Object3D | null {
  if (!scene) return null
  if (plan.kind === 'layer') {
    for (const name of plan.names) {
      const found = scene.getObjectByName(name)
      if (found) return found
    }
    return null
  }
  return selectionProxy(scene, plan.floorId, plan.deskIds)
}

function selectionProxy(scene: SceneLookup, floorId: string, deskIds: readonly string[]): Object3D | null {
  const matrix = placementMatrix(scene, floorId)
  const parent = new Object3D()
  parent.name = 'FocusFitSelection'
  let count = 0
  for (const deskId of deskIds) {
    const place = deskLocal(floorId, deskId)
    if (!place) continue
    corner.set(place.x, 0, place.z).applyMatrix4(matrix)
    const child = new Object3D() as WithGeometry
    child.position.set(corner.x, corner.y, corner.z)
    const geometry = new BufferGeometry()
    geometry.setAttribute(
      'position',
      new Float32BufferAttribute([-DESK_HALF_X, 0, -DESK_HALF_Z, DESK_HALF_X, DESK_HEIGHT, DESK_HALF_Z], 3),
    )
    child.geometry = geometry
    parent.add(child)
    count += 1
  }
  if (count === 0) return null
  parent.updateWorldMatrix(true, true)
  return parent
}
