import type { Intersection, Material, Object3D, Plane } from 'three'
import { Layers, Mesh, Raycaster, Vector2, Vector3 } from 'three'
import { registerEscapeLayer } from '../ui/escapeLayers'

/** 楼板 / 地下室板 / 已命名的场地。道路等没起名的地面是 Park 的兄弟网格。 */
const SURFACE_NAMES = new Set(['FloorSlab', 'B1Slab', 'Park', 'Parcel'])

/** 比浏览器的 click 抖动略宽，用来把轨道拖动和落点分开。 */
export const MEASURE_CLICK_PX = 6

/** 第二次点击离起点太近就当没点，避免双击落成 0 米。 */
export const MEASURE_MIN_METERS = 0.05

/** 抬离表面一点点，避开和楼板共面闪烁。 */
export const MEASURE_LIFT_M = 0.04

/**
 * 裁切面距离的数值误差。three 在 distance < 0 时丢掉片段。
 * FloorCut 的平面是世界坐标 (0,-1,0)、constant = 楼板顶，
 * 因此 y 高于切面的交点是被剪掉的，不能当测距点。
 */
const CLIP_EPS = 1e-4

export type MeasureSegment = {
  start: Vector3
  end: Vector3 | null
  committed: boolean
}

export function measureSessionKey(view: string, floor: string | null, exploded: boolean): string {
  return `${view}\0${floor ?? ''}\0${exploded ? '1' : '0'}`
}

export function formatMeasureMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  return `${meters.toFixed(2)}\u00A0m`
}

export function isMeasureClick(dx: number, dy: number, threshold = MEASURE_CLICK_PX): boolean {
  return dx * dx + dy * dy <= threshold * threshold
}

/** 测量射线只开第 0 层。B1Pick 在 PICK_VOLUME_LAYER，不能被量到。 */
export function createMeasureRaycaster(): Raycaster {
  const raycaster = new Raycaster()
  raycaster.layers.set(0)
  raycaster.far = 4000
  return raycaster
}

export function measureRayMissesPickVolume(raycaster: Raycaster, pickLayer: number): boolean {
  const pick = new Layers()
  pick.set(pickLayer)
  return pick.test(raycaster.layers) === false
}

export function isInstancedPick(object: Object3D): boolean {
  return (object as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh === true
}

/**
 * 楼板靠名字。道路 / 人行道 / 斑马线没有名字，但是 Park 的兄弟网格。
 * 树和路灯也挂在这一层，它们是 InstancedMesh，前面已经排除。
 * 不读 materials 单例，避免懒包再从主包多导出一份材质。
 */
export function isMeasureSurface(object: Object3D): boolean {
  if (isInstancedPick(object)) return false
  if (object.userData.floorStencil === true || object.userData.floorStencilProp === true) return false
  if (SURFACE_NAMES.has(object.name)) return true
  const mesh = object as Mesh
  if (mesh.isMesh !== true) return false
  const parent = object.parent
  if (!parent) return false
  for (let i = 0; i < parent.children.length; i += 1) {
    if (parent.children[i]?.name === 'Park') return true
  }
  return false
}

export function isClippedOut(
  point: Vector3,
  material: Material | Material[] | undefined,
  clippingEnabled: boolean,
): boolean {
  if (!clippingEnabled || !material) return false
  const list = Array.isArray(material) ? material : [material]
  for (const item of list) {
    const planes = item?.clippingPlanes
    if (!planes) continue
    for (const plane of planes) {
      if (clippedByPlane(plane, point)) return true
    }
  }
  return false
}

function clippedByPlane(plane: Plane, point: Vector3): boolean {
  return plane.distanceToPoint(point) < -CLIP_EPS
}

/**
 * 只在地面 / 楼板里取最近的可见交点。
 * Instanced 家具的交点精度不稳，直接跳过，落到它下面的楼板。
 * FloorCut 剪掉的一侧也不收：射线仍会打中被剪掉的三角面。
 */
export function pickMeasurePoint(hits: readonly Intersection[], clippingEnabled: boolean): Vector3 | null {
  for (const hit of hits) {
    const object = hit.object
    if (!object.visible || isInstancedPick(object)) continue
    if (!isMeasureSurface(object)) continue
    const mesh = object as Mesh
    if (isClippedOut(hit.point, mesh.material, clippingEnabled)) continue
    let parent = object.parent
    let hidden = false
    while (parent) {
      if (!parent.visible) {
        hidden = true
        break
      }
      parent = parent.parent
    }
    if (hidden) continue
    return hit.point.clone()
  }
  return null
}

export function raycastMeasurePoint(
  raycaster: Raycaster,
  root: Object3D,
  clippingEnabled: boolean,
): Vector3 | null {
  const targets: Object3D[] = []
  root.traverseVisible((object) => {
    if (isMeasureSurface(object)) targets.push(object)
  })
  const hits: Intersection[] = []
  raycaster.intersectObjects(targets, false, hits)
  return pickMeasurePoint(hits, clippingEnabled)
}

export function pointerToNdc(clientX: number, clientY: number, rect: DOMRect, target: Vector2): Vector2 | null {
  if (rect.width <= 0 || rect.height <= 0) return null
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  target.set(x * 2 - 1, -(y * 2 - 1))
  return target
}

export function placeMeasurePoint(current: MeasureSegment | null, point: Vector3): MeasureSegment {
  const next = point.clone()
  if (!current || current.committed) return { start: next, end: null, committed: false }
  if (current.start.distanceTo(next) < MEASURE_MIN_METERS) return current
  return { start: current.start, end: next, committed: true }
}

export function previewMeasureEnd(current: MeasureSegment | null, point: Vector3): MeasureSegment | null {
  if (!current || current.committed) return current
  if (current.end && current.end.distanceToSquared(point) < 1e-8) return current
  return { start: current.start, end: point.clone(), committed: false }
}

export function measureLinePoints(segment: MeasureSegment | null): [Vector3, Vector3] | null {
  if (!segment?.end) return null
  return [
    new Vector3(segment.start.x, segment.start.y + MEASURE_LIFT_M, segment.start.z),
    new Vector3(segment.end.x, segment.end.y + MEASURE_LIFT_M, segment.end.z),
  ]
}

export function measureLabelText(segment: MeasureSegment | null): string {
  if (!segment?.end) return ''
  return formatMeasureMeters(segment.start.distanceTo(segment.end))
}

/** Esc 走既有分层。调用方在退出时卸掉工具，层会跟着注销。 */
export function bindMeasureEscape(exit: () => void): () => void {
  return registerEscapeLayer('measure', exit)
}

export type FrameClock = {
  request: (callback: () => void) => number
  cancel: (id: number) => void
}

/**
 * demand 下指针按着时持续 invalidate。
 * 相机拖动本身会要帧，这里再补一条，预览线不会停在按下那一帧。
 */
export function createDragFramePump(invalidate: () => void, clock?: FrameClock) {
  const request = clock?.request ?? ((callback: () => void) => requestAnimationFrame(callback))
  const cancel = clock?.cancel ?? ((id: number) => cancelAnimationFrame(id))
  let id = 0
  let dragging = false
  const tick = () => {
    if (!dragging) return
    invalidate()
    id = request(tick)
  }
  return {
    start() {
      if (dragging) return
      dragging = true
      id = request(tick)
    },
    stop() {
      if (!dragging && id === 0) return
      dragging = false
      if (id) cancel(id)
      id = 0
      invalidate()
    },
  }
}
