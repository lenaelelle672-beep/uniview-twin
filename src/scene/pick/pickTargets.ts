import type { Object3D } from 'three'
import { isMeasureSurface } from '../../measure/measurePick'
import { pickBvhHomeOf } from './pickBvhHome'

export interface PickGroup {
  id: string
  parent: Object3D
  objects: Object3D[]
}

function homeParent(object: Object3D): Object3D | null {
  return pickBvhHomeOf(object)
}

function coveredBy(object: Object3D, roots: readonly Object3D[]): boolean {
  for (const root of roots) {
    if (root === object) return true
    let parent = object.parent
    while (parent) {
      if (parent === root) return true
      parent = parent.parent
    }
  }
  return false
}

function sameHome(objects: readonly Object3D[]): Object3D | null {
  if (objects.length === 0) return null
  const parent = homeParent(objects[0]!)
  if (!parent) return null
  for (const object of objects) {
    if (homeParent(object) !== parent) return null
  }
  return parent
}

/** 已经包进 Bvh 的网格仍从原来的父级找得到：只钻进 PickBvh 组。 */
function measureObjectsUnder(parent: Object3D, covered: readonly Object3D[]): Object3D[] {
  const found: Object3D[] = []
  const visit = (container: Object3D) => {
    for (const child of container.children) {
      if (child.name.startsWith('PickBvh:')) {
        visit(child)
        continue
      }
      if (!isMeasureSurface(child) || coveredBy(child, covered)) continue
      found.push(child)
    }
  }
  visit(parent)
  found.sort((left, right) => left.name.localeCompare(right.name) || left.uuid.localeCompare(right.uuid))
  return found
}

export function collectEnterPickGroups(scene: Object3D): PickGroup[] {
  const shells: Object3D[] = []
  let basement: Object3D | null = null
  let basementPick: Object3D | null = null
  scene.traverse((object) => {
    if (object.name.startsWith('FloorShell-')) shells.push(object)
    else if (object.name === 'B1') basement = object
    else if (object.name === 'B1Pick') basementPick = object
  })
  shells.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  const groups: PickGroup[] = []
  const shellParent = sameHome(shells)
  if (shellParent) groups.push({ id: 'enter-shells', parent: shellParent, objects: shells })
  if (basement) {
    const parent = homeParent(basement)
    if (parent) groups.push({ id: 'enter-b1', parent, objects: [basement] })
  }
  if (basementPick) {
    const parent = homeParent(basementPick)
    if (parent) groups.push({ id: 'enter-b1pick', parent, objects: [basementPick] })
  }
  return groups
}

function singleton(id: string, object: Object3D | null, covered: readonly Object3D[]): PickGroup | null {
  if (!object || !object.visible || coveredBy(object, covered)) return null
  const parent = homeParent(object)
  if (!parent) return null
  return { id, parent, objects: [object] }
}

/**
 * 测距打在地面和命名楼板。楼层壳 / B1 整组已经在进层 Bvh 里时不再包第二遍。
 * 室内 FloorSlab 由所在楼层自己挂，避免总览宿主比楼层活得久，把节点留在预构建缓存里。
 */
export function collectMeasurePickGroups(scene: Object3D, covered: readonly Object3D[]): PickGroup[] {
  let park: Object3D | null = null
  let parcel: Object3D | null = null
  let basementSlab: Object3D | null = null
  scene.traverse((object) => {
    if (object.name === 'Park') park = object
    else if (object.name === 'Parcel') parcel = object
    else if (object.name === 'B1Slab') basementSlab = object
  })
  const groups: PickGroup[] = []
  if (park && !coveredBy(park, covered)) {
    const parent = homeParent(park)
    if (parent) {
      const objects = measureObjectsUnder(parent, covered)
      if (objects.length > 0) groups.push({ id: 'measure-ground', parent, objects })
    }
  }
  const parcelGroup = singleton('measure-parcel', parcel, covered)
  if (parcelGroup) groups.push(parcelGroup)
  const slabGroup = singleton('measure-b1slab', basementSlab, covered)
  if (slabGroup) groups.push(slabGroup)
  return groups
}

export function pickGroupSignature(groups: readonly PickGroup[]): string {
  return groups
    .map((group) => `${group.id}@${group.parent.uuid}:${group.objects.map((object) => object.uuid).join(',')}`)
    .join('|')
}
