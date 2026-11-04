import { Matrix4, Quaternion, Vector3 } from 'three'
import { ROUNDED_ANCHOR_INDEX } from './plan'

/**
 * T122：从第 0 号工位读世界矩阵。
 * 只读 getMatrixAt。单位矩阵当成实例还没提交。
 */

export interface AnchorHost {
  count: number
  isInstancedMesh: boolean
  matrixWorld: Matrix4
  getMatrixAt: (index: number, target: Matrix4) => void
  updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void
}

export interface AnchorPose {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  scale: [number, number, number]
}

const local = new Matrix4()
const position = new Vector3()
const quaternion = new Quaternion()
const scale = new Vector3()

function isIdentity(elements: ArrayLike<number>): boolean {
  for (let index = 0; index < 16; index += 1) {
    const expected = index % 5 === 0 ? 1 : 0
    if (Math.abs((elements[index] ?? 0) - expected) > 1e-8) return false
  }
  return true
}

function finiteElements(elements: ArrayLike<number>): boolean {
  for (let index = 0; index < 16; index += 1) {
    if (!Number.isFinite(elements[index] ?? Number.NaN)) return false
  }
  return true
}

export function readAnchorWorld(host: AnchorHost, target: Matrix4): boolean {
  if (host.isInstancedMesh !== true || host.count < 1) return false
  host.updateWorldMatrix(true, false)
  host.getMatrixAt(ROUNDED_ANCHOR_INDEX, local)
  if (!finiteElements(local.elements) || isIdentity(local.elements)) return false
  target.multiplyMatrices(host.matrixWorld, local)
  return finiteElements(target.elements)
}

export function anchorPose(host: AnchorHost): AnchorPose | null {
  const world = new Matrix4()
  if (!readAnchorWorld(host, world)) return null
  world.decompose(position, quaternion, scale)
  if (scale.x === 0 || scale.y === 0 || scale.z === 0) return null
  if (!Number.isFinite(position.x) || !Number.isFinite(quaternion.w)) return null
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    scale: [scale.x, scale.y, scale.z],
  }
}

export function sameAnchorPose(prev: AnchorPose | null, next: AnchorPose | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  for (let index = 0; index < 3; index += 1) {
    if (prev.position[index] !== next.position[index]) return false
    if (prev.scale[index] !== next.scale[index]) return false
  }
  for (let index = 0; index < 4; index += 1) {
    if (prev.quaternion[index] !== next.quaternion[index]) return false
  }
  return true
}
