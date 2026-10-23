import type { BufferGeometry, Mesh, Object3D } from 'three'

export type WireMode = 'shell' | 'floor'

const SHELL_ROOTS = new Set(['Tower', 'Podium', 'EastBlock', 'B1'])
const SHELL_PARENTS = new Set(['Podium', 'EastBlock', 'RoofAssembly'])
const SKIP_DESCEND = new Set(['EastGrille', 'RoofSign', 'roof_sign', 'WireOverlay', 'WireframeOverlay'])
const INTERIOR_MESHES = new Set(['FloorSlab', 'FloorCores', 'PantryPad'])
const B1_MESHES = new Set(['B1Slab', 'B1Zones'])

/** 总览画外壳。已经进了某一层就只画这一层，不再把其余外壳铺成线框。 */
export function wireTargetMode(view: string, floorId: string | null): WireMode {
  if (view === 'floor' && floorId) return 'floor'
  return 'shell'
}

function hasAncestor(object: Object3D, name: string): boolean {
  let current: Object3D | null = object.parent
  while (current) {
    if (current.name === name) return true
    current = current.parent
  }
  return false
}

function underShellRoot(object: Object3D): boolean {
  let current: Object3D | null = object.parent
  while (current) {
    if (SHELL_ROOTS.has(current.name)) return true
    current = current.parent
  }
  return false
}

function asPlainMesh(object: Object3D): Mesh | null {
  const mesh = object as Object3D & {
    isMesh?: boolean
    isInstancedMesh?: boolean
    isSkinnedMesh?: boolean
    geometry?: BufferGeometry
  }
  if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh) return null
  const position = mesh.geometry?.getAttribute?.('position')
  if (!position || position.count < 3) return null
  return object as Mesh
}

function acceptShell(mesh: Mesh): boolean {
  if (!underShellRoot(mesh)) return false
  const name = mesh.name
  if (/^FloorCurtain-/.test(name) || /^FloorBand-/.test(name)) return true
  if (name === 'RoofParapet' || name === 'B1Slab' || name === 'B1Zones' || name === 'CourtyardWall') return true
  const parent = mesh.parent?.name ?? ''
  return SHELL_PARENTS.has(parent)
}

function acceptFloor(mesh: Mesh, floorId: string): boolean {
  if (INTERIOR_MESHES.has(mesh.name) && hasAncestor(mesh, 'FloorInterior')) return true
  // 楼层外壳组上还会挂房间标签。只收这一层的幕墙和层线，不收标签和其它子节点。
  if (
    (mesh.name === `FloorCurtain-${floorId}` || mesh.name === `FloorBand-${floorId}`) &&
    hasAncestor(mesh, `FloorShell-${floorId}`)
  ) {
    return true
  }
  if (floorId === 'B1' && B1_MESHES.has(mesh.name) && hasAncestor(mesh, 'B1')) return true
  return false
}

/**
 * 外壳：塔楼幕墙/层线、屋顶、裙楼、东楼实体、地下室板。
 * 不收东立面格栅、屋顶字、实例化翅片、场地和室内家具。
 * 当前层：该层楼板、核心筒，以及这一层自己的外壳（其它层外壳不算）。
 */
export function collectWireMeshes(scene: Object3D, mode: WireMode, floorId: string | null): Mesh[] {
  const found: Mesh[] = []
  const visit = (object: Object3D) => {
    if (!object.visible) return
    if (SKIP_DESCEND.has(object.name)) return
    const mesh = asPlainMesh(object)
    if (mesh) {
      const take = mode === 'floor' && floorId ? acceptFloor(mesh, floorId) : mode === 'shell' && acceptShell(mesh)
      if (take) found.push(mesh)
    }
    for (const child of object.children) visit(child)
  }
  visit(scene)
  return found
}

/** 克隆后再交给 drei Wireframe，避免它把外壳几何改成非索引。 */
export function prepareWireGeometry(source: BufferGeometry): BufferGeometry | null {
  const position = source.getAttribute('position')
  if (!position || position.count < 3) return null
  const next = source.index ? source.toNonIndexed() : source.clone()
  next.clearGroups()
  const count = next.getAttribute('position')?.count ?? 0
  if (count < 3 || count % 3 !== 0) {
    next.dispose()
    return null
  }
  if (!next.boundingSphere) next.computeBoundingSphere()
  return next
}

export function sameMeshList(prev: readonly Mesh[], next: readonly Mesh[]): boolean {
  if (prev.length !== next.length) return false
  for (let i = 0; i < prev.length; i += 1) if (prev[i] !== next[i]) return false
  return true
}
