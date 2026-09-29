import { floorSpec, type FloorSpec } from '../../data/floors'
import type { CameraPose } from '../cameras'
import { b1SlabBounds } from './b1Plan'
import { SLAB_M } from './cut'

/**
 * 从总览压到楼层附近。smoothTime 取 1.5，camera-controls 以此作为到达目标的大约时间。
 * 机位落在被剖掉的上层空间里，俯看本层楼板。
 */
export function floorCameraPose(floorId: string): CameraPose {
  const spec = floorSpec(floorId)
  if (spec.level < 0) return basementPose()
  return towerPose(spec)
}

function towerPose(spec: FloorSpec): CameraPose {
  const floorY = spec.elevation + SLAB_M
  return {
    position: [-2, floorY + 15.54, 34],
    target: [1, floorY + 0.42, 1],
    fov: 84,
  }
}

function basementPose(): CameraPose {
  const bounds = b1SlabBounds()
  const cx = (bounds.x0 + bounds.x1) / 2
  const cz = (bounds.z0 + bounds.z1) / 2
  return {
    position: [cx, 108, cz + 18],
    target: [cx, -5.25, cz],
    fov: 48,
  }
}
