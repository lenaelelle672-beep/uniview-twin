import {
  AlwaysStencilFunc,
  BackSide,
  Box3,
  BufferGeometry,
  DecrementWrapStencilOp,
  FrontSide,
  Group,
  IncrementWrapStencilOp,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  Plane,
  PlaneGeometry,
  ReplaceStencilOp,
  Vector3,
  type Material,
  type Object3D,
} from 'three'

/** 主相机额外打开的层。0 主场景、1 拾取、2 显示器、3 深度代理、4 工位描边载体。接触阴影和阴影贴图相机只看 0，封盖不会进阴影。 */
export const STENCIL_CAP_LAYER = 5

/** 官方 webgl_clipping_stencil：back、front 分开放，避免 sortObjects 把同 renderOrder 的两面打乱。 */
export const STENCIL_BACK_ORDER = 1
export const STENCIL_FRONT_ORDER = 1.05
export const STENCIL_CAP_ORDER = 1.1
export const STENCIL_PRIMER_ORDER = 0.9

/** 盖住塔楼、裙楼和东楼在世界原点附近的截面。 */
export const CAP_PLANE_SIZE = 640

const _box = new Box3()
const _corner = new Vector3()
const _look = new Vector3()

export type StencilMaterials = {
  back: MeshBasicMaterial
  front: MeshBasicMaterial
}

export type StencilPair = {
  source: Mesh
  back: Mesh
  front: Mesh
}

export function createStencilMaterials(plane: Plane): StencilMaterials {
  const back = new MeshBasicMaterial({
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: AlwaysStencilFunc,
    side: BackSide,
    clippingPlanes: [plane],
    stencilFail: IncrementWrapStencilOp,
    stencilZFail: IncrementWrapStencilOp,
    stencilZPass: IncrementWrapStencilOp,
  })
  const front = new MeshBasicMaterial({
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: AlwaysStencilFunc,
    side: FrontSide,
    clippingPlanes: [plane],
    stencilFail: DecrementWrapStencilOp,
    stencilZFail: DecrementWrapStencilOp,
    stencilZPass: DecrementWrapStencilOp,
  })
  back.name = 'FloorStencilBack'
  front.name = 'FloorStencilFront'
  return { back, front }
}

/** 色和粗糙度跟实体壳走，不改壳材质本身。 */
export function createCapMaterial(source: MeshStandardMaterial): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: source.color.clone(),
    roughness: source.roughness,
    metalness: source.metalness,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: NotEqualStencilFunc,
    stencilFail: ReplaceStencilOp,
    stencilZFail: ReplaceStencilOp,
    stencilZPass: ReplaceStencilOp,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: FrontSide,
  })
  material.name = 'FloorStencilCap'
  material.clipShadows = false
  return material
}

export function syncCapSurface(material: MeshStandardMaterial, source: MeshStandardMaterial): boolean {
  let changed = false
  if (!material.color.equals(source.color)) {
    material.color.copy(source.color)
    changed = true
  }
  if (material.roughness !== source.roughness) {
    material.roughness = source.roughness
    changed = true
  }
  if (material.metalness !== source.metalness) {
    material.metalness = source.metalness
    changed = true
  }
  return changed
}

/**
 * 官方示例用 plane.coplanarPoint + lookAt(position - normal)。
 * 水平切面的法线与物体 up 平行，lookAt 会把几百米的盖子拧出倾角，这里改成同等朝向的水平放置：PlaneGeometry 的 +Z 朝上。
 */
export function orientClipCap(object: Object3D, plane: Plane): void {
  plane.coplanarPoint(object.position)
  if (Math.abs(plane.normal.x) < 1e-6 && Math.abs(plane.normal.z) < 1e-6) {
    object.rotation.set(plane.normal.y <= 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0)
    object.updateMatrixWorld()
    return
  }
  _look.set(object.position.x - plane.normal.x, object.position.y - plane.normal.y, object.position.z - plane.normal.z)
  object.lookAt(_look)
  object.updateMatrixWorld()
}

export function createCapMesh(source: MeshStandardMaterial): Mesh {
  const mesh = new Mesh(new PlaneGeometry(CAP_PLANE_SIZE, CAP_PLANE_SIZE), createCapMaterial(source))
  mesh.name = 'FloorStencilCap'
  mesh.renderOrder = STENCIL_CAP_ORDER
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = true
  mesh.userData.floorStencil = true
  mesh.userData.floorStencilProp = true
  mesh.layers.set(STENCIL_CAP_LAYER)
  mesh.raycast = () => {}
  mesh.onAfterRender = (renderer) => {
    renderer.clearStencil()
  }
  return mesh
}

export function createStencilPrimer(): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
    }),
  )
  mesh.name = 'FloorStencilPrimer'
  mesh.renderOrder = STENCIL_PRIMER_ORDER
  mesh.frustumCulled = false
  mesh.scale.setScalar(0)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.userData.floorStencil = true
  mesh.userData.floorStencilProp = true
  mesh.layers.set(STENCIL_CAP_LAYER)
  mesh.raycast = () => {}
  mesh.onBeforeRender = (renderer) => {
    renderer.clearStencil()
  }
  return mesh
}

function underNamed(object: Object3D, name: string): boolean {
  let cursor: Object3D | null = object
  while (cursor) {
    if (cursor.name === name) return true
    cursor = cursor.parent
  }
  return false
}

function branchVisible(object: Object3D): boolean {
  let cursor: Object3D | null = object
  while (cursor) {
    if (!cursor.visible) return false
    cursor = cursor.parent
  }
  return true
}

export function materialUsesPlane(material: Material | Material[] | undefined, plane: Plane): boolean {
  const list = Array.isArray(material) ? material : material ? [material] : []
  return list.some((item) => item?.clippingPlanes?.includes(plane))
}

function boxCrossesPlane(box: Box3, plane: Plane): boolean {
  let kept = false
  let clipped = false
  for (let i = 0; i < 8; i += 1) {
    _corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
    const distance = plane.distanceToPoint(_corner)
    if (distance < -1e-3) clipped = true
    else kept = true
    if (kept && clipped) return true
  }
  return false
}

export function meshCrossesClip(mesh: Mesh, plane: Plane): boolean {
  if ((mesh as InstancedMesh).isInstancedMesh) return true
  const geometry = mesh.geometry
  if (!geometry) return false
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  if (!geometry.boundingBox) return true
  mesh.updateWorldMatrix(true, false)
  _box.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
  return boxCrossesPlane(_box, plane)
}

/** 室内不参与。只收当前切面上、包围盒穿过切面的外壳。 */
export function isStencilCapSource(object: Object3D, plane: Plane): object is Mesh {
  const mesh = object as Mesh
  if (!mesh.isMesh || !mesh.geometry) return false
  if (mesh.userData.floorStencil) return false
  if (underNamed(mesh, 'FloorStencilCaps') || underNamed(mesh, 'FloorInterior')) return false
  if (!branchVisible(mesh)) return false
  if (!materialUsesPlane(mesh.material, plane)) return false
  return meshCrossesClip(mesh, plane)
}

export function collectStencilSources(root: Object3D, plane: Plane): Mesh[] {
  const sources: Mesh[] = []
  root.traverse((object) => {
    if (isStencilCapSource(object, plane)) sources.push(object)
  })
  return sources
}

function poseLike(stencil: Object3D, source: Object3D) {
  source.updateWorldMatrix(true, false)
  stencil.matrixAutoUpdate = false
  stencil.matrix.copy(source.matrixWorld)
  stencil.matrixWorldNeedsUpdate = true
}

function bindInstances(stencil: InstancedMesh, source: InstancedMesh) {
  stencil.instanceMatrix = source.instanceMatrix
  stencil.count = source.count
  if (source.instanceColor) stencil.instanceColor = source.instanceColor
}

function makeStencilMesh(source: Mesh, material: MeshBasicMaterial, renderOrder: number): Mesh {
  const instanced = source as InstancedMesh
  const mesh = instanced.isInstancedMesh
    ? new InstancedMesh(source.geometry, material, Math.max(instanced.count, 1))
    : new Mesh(source.geometry, material)
  if (instanced.isInstancedMesh && mesh instanceof InstancedMesh) bindInstances(mesh, instanced)
  mesh.name = renderOrder === STENCIL_BACK_ORDER ? 'FloorStencilBack' : 'FloorStencilFront'
  mesh.renderOrder = renderOrder
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.userData.floorStencil = true
  mesh.layers.set(STENCIL_CAP_LAYER)
  mesh.raycast = () => {}
  poseLike(mesh, source)
  return mesh
}

function isProp(object: Object3D): boolean {
  return object.userData.floorStencilProp === true
}

function dropStencilShells(host: Group) {
  for (const child of [...host.children]) {
    if (isProp(child)) continue
    host.remove(child)
  }
}

export function syncFloorStencilCaps(root: Object3D, plane: Plane, host: Group, materials: StencilMaterials): boolean {
  const sources = collectStencilSources(root, plane)
  const previous = (host.userData.sources as Mesh[] | undefined) ?? []
  const same = previous.length === sources.length && previous.every((mesh, index) => mesh === sources[index])
  let pairs = (host.userData.pairs as StencilPair[] | undefined) ?? []
  if (!same) {
    dropStencilShells(host)
    pairs = sources.map((source) => {
      const back = makeStencilMesh(source, materials.back, STENCIL_BACK_ORDER)
      const front = makeStencilMesh(source, materials.front, STENCIL_FRONT_ORDER)
      host.add(back, front)
      return { source, back, front }
    })
    host.userData.sources = sources
    host.userData.pairs = pairs
  } else {
    for (const pair of pairs) {
      poseLike(pair.back, pair.source)
      poseLike(pair.front, pair.source)
      const instanced = pair.source as InstancedMesh
      if (instanced.isInstancedMesh) {
        const back = pair.back as InstancedMesh
        const front = pair.front as InstancedMesh
        back.count = instanced.count
        front.count = instanced.count
      }
    }
  }
  const active = sources.length > 0
  const cap = host.getObjectByName('FloorStencilCap')
  const primer = host.getObjectByName('FloorStencilPrimer')
  if (cap) {
    cap.visible = active
    if (active) orientClipCap(cap, plane)
  }
  if (primer) primer.visible = active
  return !same
}

export function releaseStencilMaterials(materials: StencilMaterials | null | undefined) {
  materials?.back.dispose()
  materials?.front.dispose()
}

export function releaseCapMesh(mesh: Mesh | null | undefined) {
  if (!mesh) return
  const geometry = mesh.geometry
  if (geometry && !(mesh.userData.sharedGeometry as boolean)) geometry.dispose()
  const material = mesh.material
  const list = Array.isArray(material) ? material : [material]
  for (const item of list) item?.dispose()
}

export function createStencilHost(): Group {
  const host = new Group()
  host.name = 'FloorStencilCaps'
  host.userData.floorStencil = true
  host.matrixAutoUpdate = true
  return host
}

/** 测试用：确认外壳几何没被封盖卸载掉。 */
export function geometryLive(geometry: BufferGeometry): boolean {
  return Boolean(geometry.getAttribute('position'))
}

export function capFacesUp(mesh: Object3D): Vector3 {
  mesh.updateMatrixWorld(true)
  return new Vector3(0, 0, 1).transformDirection(mesh.matrixWorld)
}
