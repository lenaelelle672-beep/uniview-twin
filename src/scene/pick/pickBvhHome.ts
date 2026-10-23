import type { Object3D } from 'three'

/** 网格可能已经挂在 PickBvh 组下。原父级要么记在 userData 上，要么再往上走一层。 */
export function pickBvhHomeOf(object: Object3D): Object3D | null {
  const saved = object.userData.pickBvhHome
  if (saved && typeof saved === 'object') return saved as Object3D
  let parent = object.parent
  while (parent?.name.startsWith('PickBvh:')) parent = parent.parent
  return parent
}
