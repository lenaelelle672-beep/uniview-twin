import { Box3, Vector3, type Object3D } from 'three'
import { probeFar } from './plan'

const box = new Box3()
const center = new Vector3()

export interface ProbePlacement {
  id: string
  meshName: string
  position: [number, number, number]
  far: number
  mesh: Object3D
}

/** 探针放在这块玻璃的世界包围盒中心。far 盖住这块盒子，不跟着镜头改。 */
export function placementOf(object: Object3D, floorId: string): ProbePlacement | null {
  box.makeEmpty()
  box.setFromObject(object)
  if (box.isEmpty()) return null
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)
  if (!(span > 0)) return null
  box.getCenter(center)
  const name = object.name || 'room-glass'
  return {
    id: `${floorId}:${name}:${object.uuid}`,
    meshName: name,
    position: [center.x, center.y, center.z],
    far: probeFar(span),
    mesh: object,
  }
}
