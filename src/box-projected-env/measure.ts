import { Box3, type Object3D } from 'three'
import { roomBoxFromSlab, type RoomBox } from './plan'

const box = new Box3()

/**
 * 用当前房间的 FloorSlab 世界包围盒量平面足迹，再叠上这一层的标高和层高。
 * 不逐帧量。调用方自己决定什么时候再量。
 */
export function measureFloorRoom(scene: Object3D, elevation: number, height: number): RoomBox | null {
  const interior = scene.getObjectByName('FloorInterior')
  const slab = interior?.getObjectByName('FloorSlab')
  if (!slab) return null
  box.makeEmpty()
  box.setFromObject(slab)
  if (box.isEmpty()) return null
  return roomBoxFromSlab(
    { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z },
    elevation,
    height,
  )
}
