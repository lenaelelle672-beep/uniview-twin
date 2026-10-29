import { InstancedMesh, Matrix4, type Object3D } from 'three'

/** three DynamicDrawUsage。放懒包字面量，避免首屏再点名这个导出。 */
const DynamicDrawUsage = 35048

const PROP_MATERIALS = new Set(['tree_trunk', 'tree_leaves', 'lamp_body', 'lamp_light'])

/**
 * 工位 / 重复件的实例矩阵。
 * 一批 setMatrixAt 之后只打一次 needsUpdate。
 * demand 下续帧与 ExplodedLayout.askFrame 相同：rAF 后再 invalidate。
 */

const scratch = new Matrix4()

export type InstancePose = (name: string, index: number, target: Matrix4) => void

let poseFn: InstancePose | null = null
let wakePending = false
let wakeId = 0

function materialNames(mesh: InstancedMesh): string[] {
  const material = mesh.material
  if (Array.isArray(material)) return material.map((item) => item.name)
  return [material.name]
}

function isRepeatedProp(mesh: InstancedMesh): boolean {
  if (mesh.name === 'tree_leaves_shadow') return true
  for (const name of materialNames(mesh)) {
    if (PROP_MATERIALS.has(name)) return true
  }
  return false
}

let patched = false
let originalSetMatrixAt: InstancedMesh['setMatrixAt'] | null = null

/** 树 / 灯在首屏摆好后再加载。补丁只留在懒包，setMatrixAt 前改成动态缓冲。 */
function patchRepeatedPropUsage(): void {
  if (patched) return
  patched = true
  const proto = InstancedMesh.prototype
  const write = proto.setMatrixAt
  originalSetMatrixAt = write
  proto.setMatrixAt = function (this: InstancedMesh, index: number, matrix: Matrix4) {
    if (isRepeatedProp(this)) markInstanceMatrixDynamic(this)
    return write.call(this, index, matrix)
  }
}

export function markInstanceMatrixDynamic(mesh: InstancedMesh): boolean {
  const attribute = mesh.instanceMatrix
  if (attribute.usage === DynamicDrawUsage) return false
  attribute.setUsage(DynamicDrawUsage)
  return true
}

/**
 * 首帧 cutoff 之后由 DemandLoop 调用。
 * 已经上传的重复件补一次动态用法；之后新建的走 setMatrixAt 补丁。
 */
export function armRepeatedInstanceMatrices(root: Object3D | null | undefined): void {
  patchRepeatedPropUsage()
  if (!root) return
  root.traverse((child) => {
    const mesh = child as InstancedMesh
    if (mesh.isInstancedMesh !== true || !isRepeatedProp(mesh)) return
    if (markInstanceMatrixDynamic(mesh)) mesh.instanceMatrix.needsUpdate = true
  })
}

/** 循环外调用。不要在每个实例上写 needsUpdate。 */
export function commitInstanceMatrices(mesh: InstancedMesh, touchColor = false): void {
  mesh.instanceMatrix.needsUpdate = true
  if (touchColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/**
 * 先读出当前矩阵，交给 write 改，再 setMatrixAt。
 * write 只填矩阵，上传标志在循环结束后打一次。
 */
export function flushInstanceMatrices(
  mesh: InstancedMesh,
  count: number,
  write: (index: number, target: Matrix4) => void,
  touchColor = false,
): void {
  markInstanceMatrixDynamic(mesh)
  const limit = Math.min(count, mesh.instanceMatrix.count)
  for (let index = 0; index < limit; index += 1) {
    mesh.getMatrixAt(index, scratch)
    write(index, scratch)
    mesh.setMatrixAt(index, scratch)
  }
  commitInstanceMatrices(mesh, touchColor)
}

/** 与 ExplodedLayout.askFrame 相同：当前帧里同步 invalidate 不一定排到下一帧。 */
export function askInstanceFrame(invalidate: () => void): void {
  if (wakePending) return
  wakePending = true
  wakeId = requestAnimationFrame(() => {
    wakePending = false
    wakeId = 0
    invalidate()
  })
}

export function setInstancePose(next: InstancePose | null): void {
  poseFn = next
  if (!next || typeof window === 'undefined') return
  const kick = window.__twinInvalidate
  if (kick) void kick()
}

export function instancePose(): InstancePose | null {
  return poseFn
}

/** 没姿态时直接返回，不上传、不续帧。 */
export function stepInstanceMesh(mesh: InstancedMesh, invalidate: () => void): boolean {
  if (!poseFn || mesh.count <= 0) return false
  const pose = poseFn
  flushInstanceMatrices(mesh, mesh.count, (index, target) => {
    pose(mesh.name, index, target)
  })
  askInstanceFrame(invalidate)
  return true
}

export function stepInstanceGroup(root: Object3D, invalidate: () => void): number {
  if (!poseFn) return 0
  let wrote = 0
  root.traverse((child) => {
    const mesh = child as InstancedMesh
    if (mesh.isInstancedMesh === true && stepInstanceMesh(mesh, invalidate)) wrote += 1
  })
  return wrote
}

/** 测试重置。运行时不要调用。 */
export function resetInstanceMatrixMotion(): void {
  poseFn = null
  wakePending = false
  if (wakeId !== 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(wakeId)
  wakeId = 0
  if (originalSetMatrixAt) {
    InstancedMesh.prototype.setMatrixAt = originalSetMatrixAt
    originalSetMatrixAt = null
    patched = false
  }
}
