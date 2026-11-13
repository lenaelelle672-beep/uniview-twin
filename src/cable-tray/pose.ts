import { Matrix4, Quaternion, Vector3 } from 'three'

/**
 * T126：抄 FloorInterior 的世界矩阵，管子留在楼层局部坐标。
 * 只读矩阵。单位矩阵当成组还没写上位置。
 */

export interface InteriorHost {
  updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void
  matrixWorld: { elements: ArrayLike<number> }
}

export interface InteriorPose {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  scale: [number, number, number]
}

const world = new Matrix4()
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

export function interiorPose(host: InteriorHost): InteriorPose | null {
  host.updateWorldMatrix(true, false)
  const elements = host.matrixWorld?.elements
  if (!elements || elements.length < 16) return null
  if (!finiteElements(elements) || isIdentity(elements)) return null
  world.fromArray(elements)
  world.decompose(position, quaternion, scale)
  if (scale.x === 0 || scale.y === 0 || scale.z === 0) return null
  if (!Number.isFinite(position.x) || !Number.isFinite(quaternion.w)) return null
  return {
    position: [position.x, position.y, position.z],
    quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    scale: [scale.x, scale.y, scale.z],
  }
}

export function sameInteriorPose(prev: InteriorPose | null, next: InteriorPose | null): boolean {
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
