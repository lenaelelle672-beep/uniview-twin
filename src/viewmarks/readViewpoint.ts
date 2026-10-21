import { Vector3 } from 'three'
import type { Viewpoint } from '../url/viewpoint'

const position = new Vector3()
const target = new Vector3()
const focal = new Vector3()

/** 读 camera-controls 的当前眼点（不含过渡终点）和焦距偏移。 */
export function readViewpoint(): Viewpoint | null {
  const rig = window.__twinRig
  if (!rig) return null
  rig.getPosition(position, false)
  rig.getTarget(target, false)
  focal.set(0, 0, 0)
  rig.getFocalOffset?.(focal, false)
  const fov = rig.camera?.fov
  const nums = [position.x, position.y, position.z, target.x, target.y, target.z, fov, focal.x, focal.y, focal.z]
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return null
  return {
    px: position.x,
    py: position.y,
    pz: position.z,
    tx: target.x,
    ty: target.y,
    tz: target.z,
    fov: fov as number,
    fx: focal.x,
    fy: focal.y,
    fz: focal.z,
  }
}
