/**
 * T098：炸开之后的拾取。
 * 几何 BVH 在网格局部空间。楼层爆炸只改 group 的 position.y，工位爆炸只改 instanceMatrix。
 * 顶点不动，所以动画进行中禁止 computeBoundsTree / refit。树最多在落定后借已有的建树函数补一次。
 * 实例包围球 three 不会在 setMatrixAt 之后自动重算。球还停在休息姿态时，射线早退会错过已经拉开的工位。
 * 这个文件不 import three / three-mesh-bvh，生产包从工位晚加载分包带走，不进 hardGate。
 */

interface SphereLike {
  center: { x: number; y: number; z: number }
  radius: number
  clone: () => SphereLike
  copy: (source: SphereLike) => SphereLike
  applyMatrix4: (matrix: MatrixLike) => SphereLike
}

interface MatrixLike {
  elements: ArrayLike<number>
  clone: () => MatrixLike
  copy: (source: MatrixLike) => MatrixLike
  multiplyMatrices: (left: MatrixLike, right: MatrixLike) => MatrixLike
  invert: () => MatrixLike
  decompose?: (position: object, quaternion: object, scale: object) => void
}

interface VectorLike {
  x: number
  y: number
  z: number
  clone: () => VectorLike
  multiply: (other: VectorLike) => VectorLike
  length: () => number
  distanceTo?: (other: { x: number; y: number; z: number }) => number
  applyMatrix4?: (matrix: MatrixLike) => VectorLike
}

interface RayLike {
  origin: { x: number; y: number; z: number }
  direction: VectorLike
  intersectsSphere: (sphere: SphereLike) => boolean
  clone: () => RayLike
  applyMatrix4: (matrix: MatrixLike) => RayLike
}

interface Hit {
  object?: object
  instanceId?: number
  point?: VectorLike
  distance?: number
}

interface RaycasterLike {
  ray: RayLike
  near: number
  far: number
}

interface TreeLike {
  raycastFirst?: (ray: RayLike, material: unknown, near: number, far: number) => Hit | null
}

interface BoundsGeometry {
  isBufferGeometry?: boolean
  boundingSphere: SphereLike | null
  boundsTree?: TreeLike | null
  computeBoundingSphere?: () => void
  computeBoundsTree?: (options?: object) => unknown
  disposeBoundsTree?: () => void
}

interface ScratchMesh {
  isMesh?: boolean
  geometry: BoundsGeometry | null
  material: unknown
  matrixWorld: MatrixLike
}

interface PoseHold {
  pos: VectorLike
  quat: object
  scale: VectorLike
}

interface RayHold {
  original: (raycaster: RaycasterLike, intersects: Hit[]) => void
  precise: (raycaster: RaycasterLike, intersects: Hit[]) => void
  scratch: ScratchMesh
  local: MatrixLike
  world: MatrixLike
  inverse: MatrixLike
  probe: SphereLike
  meshProbe: SphereLike
  pose: PoseHold | null
}

interface InstanceLike {
  isInstancedMesh?: boolean
  isMesh?: boolean
  count?: number
  geometry?: BoundsGeometry | null
  material?: unknown
  matrixWorld?: MatrixLike
  boundingSphere?: SphereLike | null
  computeBoundingSphere?: () => void
  getMatrixAt?: (index: number, target: MatrixLike) => MatrixLike
  raycast: (raycaster: RaycasterLike, intersects: Hit[]) => void
  userData: Record<string, unknown>
  position?: VectorLike
  quaternion?: { clone: () => object }
  scale?: VectorLike
  constructor?: { prototype?: { raycast?: InstanceLike['raycast'] } }
}

interface PickScene {
  getObjectByName?: (name: string) => object | undefined
  traverse?: (visit: (child: object) => void) => void
}

export interface ExplodePickProbe {
  armed: number
  refreshed: number
  /** 落定后补过的局部 BVH 次数。动画帧里保持不变。 */
  built: number
  animating: boolean
}

export interface ExplodePickFlags {
  refresh: boolean
  allowBuild: boolean
}

const probe: ExplodePickProbe = { armed: 0, refreshed: 0, built: 0, animating: false }
const byScene = new WeakMap<object, Map<string, object>>()
const ownedTrees = new WeakSet<object>()
let failedTrees = new WeakSet<object>()
let borrowedBuild: ((this: BoundsGeometry, options?: object) => unknown) | null = null
let borrowedDispose: ((this: BoundsGeometry) => void) | null = null
let borrowAttempts = 0

function publish(): void {
  if (typeof window === 'undefined') return
  window.__twinExplodePick = { ...probe, built: probe.built }
}

export function explodePickProbe(): ExplodePickProbe {
  return { ...probe }
}

export function resetExplodePickForTests(): void {
  probe.armed = 0
  probe.refreshed = 0
  probe.built = 0
  probe.animating = false
  borrowedBuild = null
  borrowedDispose = null
  borrowAttempts = 0
  failedTrees = new WeakSet()
  if (typeof window !== 'undefined') delete window.__twinExplodePick
}

/** 进度停在 0，或已经完全展开时，才允许补树。中间帧一律不当成落定。 */
export function floorExplodeAnimating(stats: { progress?: number; exploded?: boolean } | null | undefined): boolean {
  if (!stats || typeof stats.progress !== 'number' || !Number.isFinite(stats.progress)) return false
  if (stats.progress <= 0) return false
  if (stats.progress >= 1 && stats.exploded === true) return false
  return true
}

export function refreshExplodeBoundingSphere(node: { computeBoundingSphere?: () => void } | null | undefined): boolean {
  if (!node || typeof node.computeBoundingSphere !== 'function') return false
  node.computeBoundingSphere()
  probe.refreshed += 1
  return true
}

function asInstance(node: object | null | undefined): InstanceLike | null {
  if (!node) return null
  const mesh = node as Partial<InstanceLike>
  if (!mesh.userData || typeof mesh.raycast !== 'function') return null
  return mesh as InstanceLike
}

function parentOf(node: object): boolean {
  return Boolean((node as { parent?: object | null }).parent)
}

function geometryOf(node: object | null | undefined): BoundsGeometry | null {
  if (!node) return null
  const geometry = (node as { geometry?: BoundsGeometry | null }).geometry
  return geometry ?? null
}

function named(scene: PickScene, name: string): object | undefined {
  if (!scene.getObjectByName) return undefined
  let bucket = byScene.get(scene)
  if (!bucket) {
    bucket = new Map()
    byScene.set(scene, bucket)
  }
  const cached = bucket.get(name)
  if (cached && parentOf(cached)) return cached
  const found = scene.getObjectByName(name)
  if (!found) {
    bucket.delete(name)
    return undefined
  }
  if (parentOf(found)) bucket.set(name, found)
  else bucket.delete(name)
  return found
}

function rememberBuilder(scene: PickScene | null | undefined): void {
  if (borrowedBuild || borrowAttempts >= 4 || !scene) return
  if (typeof window !== 'undefined' && (window.__twinPickBvh?.trees ?? 0) <= 0) return
  const take = (geometry: BoundsGeometry | null) => {
    if (borrowedBuild || !geometry || typeof geometry.computeBoundsTree !== 'function') return
    borrowedBuild = geometry.computeBoundsTree
    if (typeof geometry.disposeBoundsTree === 'function') borrowedDispose = geometry.disposeBoundsTree
  }
  if (scene.getObjectByName) {
    take(geometryOf(scene.getObjectByName('FloorCurtain-F1')))
    if (!borrowedBuild) take(geometryOf(scene.getObjectByName('FloorBand-F1')))
    if (!borrowedBuild) take(geometryOf(scene.getObjectByName('B1Pick')))
  }
  // 具名外壳不一定在 PickBvh 那一批里。再扫一遍已经挂上 computeBoundsTree 的网格，最多四次。
  if (!borrowedBuild) {
    scene.traverse?.((child) => {
      if (borrowedBuild) return
      take(geometryOf(child))
    })
  }
  if (!borrowedBuild) borrowAttempts += 1
}

function ensureLocalTree(node: object, allowBuild: boolean): void {
  if (!allowBuild || !borrowedBuild) return
  const geometry = geometryOf(node)
  if (!geometry || geometry.boundsTree || geometry.isBufferGeometry !== true || failedTrees.has(geometry)) return
  geometry.computeBoundsTree = borrowedBuild
  if (borrowedDispose) geometry.disposeBoundsTree = borrowedDispose
  try {
    // 只在落定后补一次。失败就继续用三角射线，不要打断这一帧的矩阵写入。
    geometry.computeBoundsTree({ verbose: false, setBoundingBox: false, indirect: false })
  } catch {
    failedTrees.add(geometry)
    return
  }
  if (!geometry.boundsTree) return
  ownedTrees.add(geometry)
  probe.built += 1
}

function meshRaycastOf(mesh: InstanceLike): RayHold['precise'] | null {
  const parent = mesh.constructor ? (Object.getPrototypeOf(mesh.constructor) as { prototype?: { raycast?: RayHold['precise'] } } | null) : null
  const precise = parent?.prototype?.raycast
  if (typeof precise !== 'function' || precise === mesh.raycast) return null
  return precise
}

function poseOf(mesh: InstanceLike): PoseHold | null {
  if (!mesh.position?.clone || !mesh.quaternion?.clone || !mesh.scale?.clone) return null
  return { pos: mesh.position.clone(), quat: mesh.quaternion.clone(), scale: mesh.scale.clone() }
}

function createScratch(mesh: InstanceLike): ScratchMesh | null {
  const MeshCtor = mesh.constructor
    ? (Object.getPrototypeOf(mesh.constructor) as (new (geometry?: BoundsGeometry | null, material?: unknown) => ScratchMesh) | null)
    : null
  if (typeof MeshCtor !== 'function') return null
  const scratch = new MeshCtor(mesh.geometry, mesh.material)
  if (scratch?.isMesh !== true || !scratch.matrixWorld) return null
  return scratch
}

function armExplodeInstanceRay(node: object): boolean {
  const mesh = asInstance(node)
  if (!mesh || mesh.userData.explodeInstanceRay === true) return false
  if (mesh.isInstancedMesh !== true || typeof mesh.getMatrixAt !== 'function') return false
  if (!mesh.geometry || !mesh.matrixWorld || typeof mesh.matrixWorld.clone !== 'function') return false
  const precise = meshRaycastOf(mesh)
  const scratch = precise ? createScratch(mesh) : null
  if (!precise || !scratch) return false
  if (!mesh.geometry.boundingSphere) mesh.computeBoundingSphere?.()
  const sphere = mesh.geometry.boundingSphere
  if (!sphere || typeof sphere.clone !== 'function') return false
  const hold: RayHold = {
    original: mesh.raycast,
    precise,
    scratch,
    local: mesh.matrixWorld.clone(),
    world: mesh.matrixWorld.clone(),
    inverse: mesh.matrixWorld.clone(),
    probe: sphere.clone(),
    meshProbe: sphere.clone(),
    pose: poseOf(mesh),
  }
  mesh.userData.explodePickHold = hold
  mesh.userData.explodeInstanceRay = true
  mesh.raycast = function explodeInstanceRaycast(raycaster: RaycasterLike, intersects: Hit[]) {
    castInstances(mesh, hold, raycaster, intersects)
  }
  probe.armed += 1
  return true
}

function scaleFactor(world: MatrixLike, ray: RayLike, pose: PoseHold): number {
  if (typeof world.decompose !== 'function') return 1
  world.decompose(pose.pos, pose.quat, pose.scale)
  const scaled = ray.direction.clone().multiply(pose.scale)
  const factor = scaled.length()
  return factor > 1e-8 ? factor : 1
}

function pushTreeHit(
  mesh: InstanceLike,
  hold: RayHold,
  raycaster: RaycasterLike,
  intersects: Hit[],
  index: number,
): boolean {
  const tree = mesh.geometry?.boundsTree
  const raycastFirst = tree?.raycastFirst
  const pose = hold.pose
  if (!raycastFirst || !pose || !mesh.material) return false
  const inverse = hold.inverse.copy(hold.world).invert()
  const localRay = raycaster.ray.clone().applyMatrix4(inverse)
  const factor = scaleFactor(hold.world, localRay, pose)
  const hit = raycastFirst.call(tree, localRay, mesh.material, raycaster.near / factor, raycaster.far / factor)
  if (!hit?.point?.applyMatrix4 || !hit.point.distanceTo) return true
  hit.point.applyMatrix4(hold.world)
  const distance = hit.point.distanceTo(raycaster.ray.origin)
  if (!Number.isFinite(distance) || distance < raycaster.near || distance > raycaster.far) return true
  hit.distance = distance
  hit.object = mesh
  hit.instanceId = index
  intersects.push(hit)
  return true
}

function castInstances(mesh: InstanceLike, hold: RayHold, raycaster: RaycasterLike, intersects: Hit[]): void {
  const geometry = mesh.geometry
  const matrixWorld = mesh.matrixWorld
  if (!geometry || !matrixWorld || typeof mesh.getMatrixAt !== 'function') return
  const count = mesh.count ?? 0
  if (count <= 0) return
  if (mesh.boundingSphere == null) mesh.computeBoundingSphere?.()
  if (mesh.boundingSphere) {
    const worldSphere = hold.meshProbe.copy(mesh.boundingSphere).applyMatrix4(matrixWorld)
    if (raycaster.ray.intersectsSphere(worldSphere) === false) return
  }
  const geoSphere = geometry.boundingSphere
  if (!geoSphere) {
    hold.original.call(mesh, raycaster, intersects)
    return
  }
  hold.scratch.geometry = geometry
  hold.scratch.material = mesh.material
  for (let index = 0; index < count; index += 1) {
    mesh.getMatrixAt(index, hold.local)
    hold.world.multiplyMatrices(matrixWorld, hold.local)
    const instanceSphere = hold.probe.copy(geoSphere).applyMatrix4(hold.world)
    if (raycaster.ray.intersectsSphere(instanceSphere) === false) continue
    if (pushTreeHit(mesh, hold, raycaster, intersects, index)) continue
    hold.scratch.matrixWorld.copy(hold.world)
    const before = intersects.length
    hold.precise.call(hold.scratch, raycaster, intersects)
    for (let hitIndex = before; hitIndex < intersects.length; hitIndex += 1) {
      const hit = intersects[hitIndex]
      if (!hit) continue
      hit.object = mesh
      hit.instanceId = index
    }
  }
}

export function releaseExplodeInstanceRay(node: object | null | undefined): void {
  const mesh = asInstance(node)
  if (!mesh) return
  const hold = mesh.userData.explodePickHold as RayHold | undefined
  if (hold) mesh.raycast = hold.original
  delete mesh.userData.explodePickHold
  delete mesh.userData.explodeInstanceRay
  const geometry = mesh.geometry
  if (geometry && ownedTrees.has(geometry)) {
    geometry.disposeBoundsTree?.()
    ownedTrees.delete(geometry)
  }
}

export function syncExplodeInstancePick(
  scene: PickScene | null | undefined,
  names: readonly string[],
  flags: ExplodePickFlags,
): void {
  probe.animating = !flags.allowBuild
  if (!scene?.getObjectByName) {
    publish()
    return
  }
  if (flags.allowBuild) rememberBuilder(scene)
  for (const name of names) {
    const node = named(scene, name)
    if (!node) continue
    if (flags.refresh) refreshExplodeBoundingSphere(node)
    ensureLocalTree(node, flags.allowBuild)
    armExplodeInstanceRay(node)
  }
  publish()
}
