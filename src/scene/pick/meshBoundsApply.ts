/**
 * T078：把远距 / 装饰密模的 raycast 换成 drei meshBounds。
 * 精确网格不进这里。Bvh（T055）仍包楼层壳和测距面，三角拾取仍是 Mesh / InstancedMesh 的默认实现。
 *
 * drei 10.7.9 的 meshBounds 只测几何体包围球和包围盒，命中点留在局部坐标，
 * 距离用局部点去减世界射线原点。这里把点变回世界坐标再重算距离，避免粗命中排到精确命中前面。
 * 实例网格按每个 instanceMatrix 调一次 meshBounds。
 * 蒙皮 / 形变网格在每次射线前重算包围体，不把结果写回共享几何，避免两个人共用一份 bounds。
 */
import { meshBounds } from '@react-three/drei/core/meshBounds'
import type { BufferAttribute, BufferGeometry, Intersection, Material, Object3D, Raycaster } from 'three'
import { Box3, Matrix4, Sphere, Vector3 } from 'three'
import {
  coarseDecorKind,
  coarseMeshLabel,
  emptyKinds,
  kindLabel,
  publishMeshBounds,
  type CoarseKind,
  type CoarseNode,
  type MeshBoundsProbe,
} from './meshBoundsPolicy'

type MeshLike = CoarseNode & {
  isInstancedMesh?: boolean
  isSkinnedMesh?: boolean
  geometry: BufferGeometry
  material: Material | Material[]
  matrixWorld: Matrix4
  boundingSphere?: Sphere | null
  count?: number
  skeleton?: { bones: Array<{ getWorldPosition: (target: Vector3) => Vector3 }> }
  morphTargetInfluences?: number[]
  getMatrixAt?: (index: number, target: Matrix4) => Matrix4
  computeBoundingSphere?: () => void
  raycast: (raycaster: Raycaster, intersects: Intersection[]) => void
}

const carrier = {
  geometry: null as BufferGeometry | null,
  material: null as Material | Material[] | null,
  matrixWorld: new Matrix4(),
}

const instanceLocal = new Matrix4()
const instanceWorld = new Matrix4()
const parentWorld = new Matrix4()
const earlySphere = new Sphere()
const scratchBox = new Box3()
const scratchSphere = new Sphere()
const inverseWorld = new Matrix4()
const bonePoint = new Vector3()
const morphPoint = new Vector3()
const basePoint = new Vector3()
const deformedPoint = new Vector3()
const bindBoxes = new WeakMap<BufferGeometry, Box3>()
const tagged = new Set<MeshLike>()

function asMesh(object: object): MeshLike | null {
  const mesh = object as MeshLike
  if (mesh.isMesh !== true || !mesh.geometry) return null
  return mesh
}

function isDeformed(mesh: MeshLike): boolean {
  if (mesh.isSkinnedMesh === true) return true
  return Array.isArray(mesh.morphTargetInfluences) && mesh.morphTargetInfluences.length > 0
}

function isInstanced(mesh: MeshLike): boolean {
  return mesh.isInstancedMesh === true && typeof mesh.getMatrixAt === 'function'
}

function ensureBounds(geometry: BufferGeometry): void {
  if (geometry.boundingBox == null) geometry.computeBoundingBox()
  if (geometry.boundingSphere == null) geometry.computeBoundingSphere()
}

/** 绑定盒只看 position。three 的 computeBoundingBox 会把每个形变目标满权重算进去，跟当前权重无关。 */
function bindBoxOf(geometry: BufferGeometry): Box3 {
  const cached = bindBoxes.get(geometry)
  if (cached) return cached
  const box = new Box3()
  const position = geometry.getAttribute('position') as BufferAttribute | undefined
  if (position) box.setFromBufferAttribute(position)
  bindBoxes.set(geometry, box)
  return box
}

/** 蒙皮用骨骼世界坐标扩盒；形变按当前权重把顶点扩进同一盒。共享几何只读绑定盒。 */
function fillDeformedBox(mesh: MeshLike, box: Box3): void {
  const geometry = mesh.geometry
  box.copy(bindBoxOf(geometry))
  if (mesh.isSkinnedMesh === true && mesh.skeleton) {
    inverseWorld.copy(mesh.matrixWorld).invert()
    for (const bone of mesh.skeleton.bones) {
      bone.getWorldPosition(bonePoint)
      bonePoint.applyMatrix4(inverseWorld)
      box.expandByPoint(bonePoint)
    }
  }
  const influences = mesh.morphTargetInfluences
  const morphs = geometry.morphAttributes?.position
  const base = geometry.getAttribute('position') as BufferAttribute | undefined
  if (!influences || !morphs) return
  const relative = geometry.morphTargetsRelative === true
  for (let i = 0; i < morphs.length; i += 1) {
    const weight = influences[i] ?? 0
    if (!weight) continue
    const attr = morphs[i] as BufferAttribute | undefined
    if (!attr) continue
    const count = base ? Math.min(attr.count, base.count) : attr.count
    for (let j = 0; j < count; j += 1) {
      morphPoint.fromBufferAttribute(attr, j)
      if (base) basePoint.fromBufferAttribute(base, j)
      else basePoint.set(0, 0, 0)
      if (relative) deformedPoint.copy(basePoint).addScaledVector(morphPoint, weight)
      else deformedPoint.lerpVectors(basePoint, morphPoint, weight)
      box.expandByPoint(deformedPoint)
    }
  }
}

function invokeMeshBounds(
  raycaster: Raycaster,
  intersects: Intersection[],
  geometry: BufferGeometry,
  material: Material | Material[],
  matrixWorld: Matrix4,
): number {
  carrier.geometry = geometry
  carrier.material = material
  carrier.matrixWorld.copy(matrixWorld)
  const before = intersects.length
  meshBounds.call(carrier, raycaster, intersects)
  return before
}

function rewriteHits(
  raycaster: Raycaster,
  intersects: Intersection[],
  from: number,
  matrixWorld: Matrix4,
  object: MeshLike,
  instanceId?: number,
): void {
  for (let i = from; i < intersects.length; ) {
    const hit = intersects[i]
    if (!hit) {
      i += 1
      continue
    }
    hit.point.applyMatrix4(matrixWorld)
    hit.distance = raycaster.ray.origin.distanceTo(hit.point)
    hit.object = object as unknown as Intersection['object']
    if (instanceId != null) hit.instanceId = instanceId
    if (hit.distance < raycaster.near || hit.distance > raycaster.far || !Number.isFinite(hit.distance)) {
      intersects.splice(i, 1)
      continue
    }
    i += 1
  }
}

function staticCoarseRaycast(this: MeshLike, raycaster: Raycaster, intersects: Intersection[]): void {
  const geometry = this.geometry
  const material = this.material
  if (!geometry || material == null) return
  ensureBounds(geometry)
  parentWorld.copy(this.matrixWorld)
  const before = invokeMeshBounds(raycaster, intersects, geometry, material, parentWorld)
  rewriteHits(raycaster, intersects, before, parentWorld, this)
}

function deformedCoarseRaycast(this: MeshLike, raycaster: Raycaster, intersects: Intersection[]): void {
  const geometry = this.geometry
  if (!geometry) return
  fillDeformedBox(this, scratchBox)
  scratchBox.getBoundingSphere(scratchSphere)
  const previousBox = geometry.boundingBox
  const previousSphere = geometry.boundingSphere
  geometry.boundingBox = scratchBox
  geometry.boundingSphere = scratchSphere
  try {
    staticCoarseRaycast.call(this, raycaster, intersects)
  } finally {
    geometry.boundingBox = previousBox
    geometry.boundingSphere = previousSphere
  }
}

function instancedCoarseRaycast(this: MeshLike, raycaster: Raycaster, intersects: Intersection[]): void {
  const geometry = this.geometry
  const material = this.material
  const getMatrixAt = this.getMatrixAt
  if (!geometry || material == null || !getMatrixAt) return
  ensureBounds(geometry)
  if (this.boundingSphere == null) this.computeBoundingSphere?.()
  parentWorld.copy(this.matrixWorld)
  if (this.boundingSphere) {
    earlySphere.copy(this.boundingSphere).applyMatrix4(parentWorld)
    if (raycaster.ray.intersectsSphere(earlySphere) === false) return
  }
  const count = this.count ?? 0
  for (let index = 0; index < count; index += 1) {
    this.getMatrixAt?.(index, instanceLocal)
    instanceWorld.multiplyMatrices(parentWorld, instanceLocal)
    const before = invokeMeshBounds(raycaster, intersects, geometry, material, instanceWorld)
    rewriteHits(raycaster, intersects, before, instanceWorld, this, index)
  }
}

function raycastFor(mesh: MeshLike): MeshLike['raycast'] {
  if (isDeformed(mesh)) return deformedCoarseRaycast
  if (isInstanced(mesh)) return instancedCoarseRaycast
  return staticCoarseRaycast
}

function restore(mesh: MeshLike): void {
  const saved = mesh.userData.twinMeshBoundsRaycast
  if (typeof saved === 'function') mesh.raycast = saved as MeshLike['raycast']
  delete mesh.userData.twinMeshBounds
  delete mesh.userData.twinMeshBoundsKind
  delete mesh.userData.twinMeshBoundsRaycast
  tagged.delete(mesh)
}

function remember(mesh: MeshLike, kind: CoarseKind): void {
  if (mesh.userData.twinMeshBounds === true) return
  mesh.userData.twinMeshBoundsRaycast = mesh.raycast
  mesh.userData.twinMeshBounds = true
  mesh.userData.twinMeshBoundsKind = kind
  if (!isDeformed(mesh)) ensureBounds(mesh.geometry)
  mesh.raycast = raycastFor(mesh)
  tagged.add(mesh)
}

export function syncCoarseMeshBounds(root: Object3D, reason: 'perf' | 'flag'): MeshBoundsProbe {
  const wanted = new Set<MeshLike>()
  root.traverse((object) => {
    const mesh = asMesh(object)
    if (!mesh) return
    const kind = coarseDecorKind(mesh)
    if (!kind) return
    wanted.add(mesh)
    remember(mesh, kind)
  })
  for (const mesh of tagged) {
    if (!wanted.has(mesh)) restore(mesh)
  }
  const kinds = emptyKinds()
  const names: string[] = []
  for (const mesh of wanted) {
    const kind = mesh.userData.twinMeshBoundsKind
    if (kind !== 'grille' && kind !== 'tree' && kind !== 'lamp' && kind !== 'sign' && kind !== 'person') continue
    kinds[kind] += 1
    const label = coarseMeshLabel(mesh, kind)
    if (names.length < 48 && !names.includes(label)) names.push(label)
  }
  names.sort()
  const probe: MeshBoundsProbe = {
    on: true,
    reason,
    count: wanted.size,
    kinds,
    names,
  }
  publishMeshBounds(probe)
  return probe
}

export function releaseCoarseMeshBounds(): MeshBoundsProbe {
  for (const mesh of [...tagged]) restore(mesh)
  const probe: MeshBoundsProbe = {
    on: false,
    reason: 'off',
    count: 0,
    kinds: emptyKinds(),
    names: [],
  }
  publishMeshBounds(probe)
  return probe
}

export function coarseKindLabels(probe: MeshBoundsProbe): string[] {
  return (Object.keys(probe.kinds) as CoarseKind[]).filter((kind) => probe.kinds[kind] > 0).map((kind) => kindLabel(kind))
}
