import type { LineBasicMaterial, LineSegments, Material, Mesh, Object3D, Plane } from 'three'
import { EdgesGeometry } from 'three/src/geometries/EdgesGeometry.js'
import { LineBasicMaterial as LineBasicMaterialLeaf } from 'three/src/materials/LineBasicMaterial.js'
import { LineSegments as LineSegmentsLeaf } from 'three/src/objects/LineSegments.js'
import { useTwinStore } from '../../store/store'
import {
  STRUCTURE_EDGE_NAME,
  STRUCTURE_HIDE_STASH,
  STRUCTURE_OVERLAY_KEY,
  STRUCTURE_WIRE_STASH,
  STRUCTURE_WIREFRAME_NAME,
  structureOverlayFrom,
  type StructureOverlayMode,
} from './structureLatch'
import {
  STRUCTURE_EDGE_ORDER,
  STRUCTURE_EDGE_POLYGON_OFFSET,
  STRUCTURE_EDGE_THRESHOLD,
  structureEdgeColor,
  structureEdgeKind,
} from './structureTargets'

/**
 * T060 结构边。只挂楼壳或当前层，不挂家具。
 *
 * drei 10.7.9 的 Edges 画的是屏幕空间粗线。这里改用 EdgesGeometry，
 * threshold 仍是它的默认 15。线用 LineBasicMaterial：linewidth 固定 1
 * （WebGL 不保证更粗的线宽），polygonOffset 把线从面上拉开，减轻 z-fight。
 * fog 保持打开，沿用场景里已有的雾，不改密度。
 *
 * 这几个类从 three/src 引进。再从 'three' 入口点名会给 early index 多一个 export。
 * 只有图层打开后才由 structureEdgesArm 动态 import，不进 hardGate / balancedFx。
 */

const RETRY_MS = 250
const RETRY_CAP = 40
/** 进层的 store 写入早于 React 提交。这段时间内旧楼板可能还在，先别停。 */
const FLOOR_HOLD_MS = 400

let shared: LineBasicMaterial | null = null
let clipped: LineBasicMaterial | null = null
let retryTimer = 0
let retries = 0
let followUp = 0
let lastHostKey = ''
let hostStable = 0
let holdUntil = 0

interface SyncOptions {
  root?: Object3D
  schedule?: boolean
  /** 定时补挂。进层、开关图层不算这个，那些会把观察窗口重新打开。 */
  reason?: 'retry'
}

function requestFrame() {
  if (typeof window === 'undefined') return
  if (window.__vpP) {
    window.__vpP()
    return
  }
  void window.__twinInvalidate?.()
}

function publish(mode: StructureOverlayMode, count: number) {
  if (typeof window === 'undefined') return
  window.__twinStructureEdges = {
    mode,
    count,
    threshold: STRUCTURE_EDGE_THRESHOLD,
    latch: 'edges-wins',
  }
}

function stopRetry() {
  retries = 0
  if (typeof window === 'undefined' || !retryTimer) {
    retryTimer = 0
    return
  }
  window.clearTimeout(retryTimer)
  retryTimer = 0
}

function resetHostWatch() {
  lastHostKey = ''
  hostStable = 0
  holdUntil = 0
}

function scheduleRetry() {
  if (typeof window === 'undefined' || retryTimer || retries >= RETRY_CAP) return
  retries += 1
  retryTimer = window.setTimeout(() => {
    retryTimer = 0
    syncStructureEdges({ reason: 'retry' })
  }, RETRY_MS)
}

/** 剖切平面在 React layout 之后才写上。下一帧再对一次，线才会跟着切面走。 */
function scheduleFrameFollowUp() {
  if (typeof window === 'undefined' || followUp) return
  followUp = window.requestAnimationFrame(() => {
    followUp = 0
    syncStructureEdges({ schedule: false })
  })
}

function isShown(object: Object3D): boolean {
  let current: Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function asMesh(object: Object3D): Mesh | null {
  const mesh = object as Mesh & { isInstancedMesh?: boolean }
  if (!mesh.isMesh || mesh.isInstancedMesh) return null
  if (!mesh.geometry?.getAttribute('position')) return null
  return mesh
}

function makeMaterial(color: string): LineBasicMaterial {
  const material = new LineBasicMaterialLeaf({
    color,
    linewidth: 1,
    polygonOffset: true,
    polygonOffsetFactor: STRUCTURE_EDGE_POLYGON_OFFSET,
    polygonOffsetUnits: STRUCTURE_EDGE_POLYGON_OFFSET,
    toneMapped: false,
    fog: true,
    depthTest: true,
    depthWrite: true,
  })
  material.name = STRUCTURE_EDGE_NAME
  material.linewidth = 1
  return material
}

function paint(material: LineBasicMaterial, color: string): boolean {
  const before = material.color.getHexString()
  material.color.set(color)
  material.linewidth = 1
  material.polygonOffset = true
  material.polygonOffsetFactor = STRUCTURE_EDGE_POLYGON_OFFSET
  material.polygonOffsetUnits = STRUCTURE_EDGE_POLYGON_OFFSET
  return material.color.getHexString() !== before
}

function sharedMaterial(color: string): LineBasicMaterial {
  if (!shared) shared = makeMaterial(color)
  paint(shared, color)
  return shared
}

function planesOf(material: Material | Material[]): Plane[] | null {
  const list = Array.isArray(material) ? material : [material]
  for (const item of list) {
    if (item?.clippingPlanes && item.clippingPlanes.length > 0) return item.clippingPlanes
  }
  return null
}

function clippedMaterial(color: string, planes: Plane[]): LineBasicMaterial {
  if (!clipped) clipped = sharedMaterial(color).clone()
  paint(clipped, color)
  const changedPlanes = clipped.clippingPlanes !== planes
  clipped.clippingPlanes = planes
  clipped.clipShadows = true
  clipped.needsUpdate = changedPlanes || clipped.needsUpdate
  return clipped
}

function disposeLines(lines: LineSegments) {
  const material = lines.material
  lines.removeFromParent()
  lines.geometry.dispose()
  if (!Array.isArray(material) && material !== shared && material !== clipped) material.dispose()
}

function edgeLines(root: Object3D): LineSegments[] {
  const found: LineSegments[] = []
  root.traverse((object) => {
    if (object.name === STRUCTURE_EDGE_NAME) found.push(object as LineSegments)
  })
  return found
}

function isWireframeOverlay(object: Object3D): boolean {
  if (object.name === STRUCTURE_EDGE_NAME) return false
  if (object.userData[STRUCTURE_OVERLAY_KEY] === 'wireframe') return true
  return object.name === STRUCTURE_WIREFRAME_NAME
}

function suppressWireframe(root: Object3D): boolean {
  let changed = false
  root.traverse((object) => {
    if (isWireframeOverlay(object)) {
      if (object.visible) {
        object.userData[STRUCTURE_HIDE_STASH] = true
        object.visible = false
        changed = true
      }
      return
    }
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const wire = material as (Material & { wireframe?: boolean }) | null
      if (!wire || typeof wire.wireframe !== 'boolean') continue
      if (wire.name === STRUCTURE_EDGE_NAME) continue
      const stamped = wire.userData[STRUCTURE_WIRE_STASH] === true
      if (!wire.wireframe && !stamped) continue
      if (!stamped) wire.userData[STRUCTURE_WIRE_STASH] = true
      if (wire.wireframe) {
        wire.wireframe = false
        wire.needsUpdate = true
        changed = true
      }
    }
  })
  return changed
}

function restoreWireframe(root: Object3D): boolean {
  let changed = false
  root.traverse((object) => {
    if (object.userData[STRUCTURE_HIDE_STASH] === true) {
      object.visible = true
      delete object.userData[STRUCTURE_HIDE_STASH]
      changed = true
    }
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const wire = material as (Material & { wireframe?: boolean }) | null
      if (wire?.userData[STRUCTURE_WIRE_STASH] !== true) continue
      wire.wireframe = true
      delete wire.userData[STRUCTURE_WIRE_STASH]
      wire.needsUpdate = true
      changed = true
    }
  })
  return changed
}

function disposeShared() {
  shared?.dispose()
  clipped?.dispose()
  shared = null
  clipped = null
}

function clearEdges(root: Object3D): boolean {
  const lines = edgeLines(root)
  for (const line of lines) disposeLines(line)
  const restored = restoreWireframe(root)
  if (lines.length > 0) disposeShared()
  return lines.length > 0 || restored
}

function attach(mesh: Mesh, color: string): LineSegments | null {
  const geometry = new EdgesGeometry(mesh.geometry, STRUCTURE_EDGE_THRESHOLD)
  const position = geometry.getAttribute('position')
  if (!position || position.count === 0) {
    geometry.dispose()
    return null
  }
  geometry.computeBoundingSphere()
  const planes = planesOf(mesh.material)
  const material = planes ? clippedMaterial(color, planes) : sharedMaterial(color)
  const lines = new LineSegmentsLeaf(geometry, material)
  lines.name = STRUCTURE_EDGE_NAME
  lines.userData[STRUCTURE_OVERLAY_KEY] = 'edges'
  lines.userData.source = mesh.geometry.uuid
  lines.raycast = () => undefined
  lines.castShadow = false
  lines.receiveShadow = false
  lines.renderOrder = STRUCTURE_EDGE_ORDER
  mesh.add(lines)
  return lines
}

function refresh(mesh: Mesh, lines: LineSegments, color: string): boolean {
  if (lines.userData.source !== mesh.geometry.uuid) {
    disposeLines(lines)
    return attach(mesh, color) != null
  }
  const planes = planesOf(mesh.material)
  const next = planes ? clippedMaterial(color, planes) : sharedMaterial(color)
  let changed = false
  if (lines.material !== next) {
    const previous = lines.material
    lines.material = next
    if (!Array.isArray(previous) && previous !== shared && previous !== clipped) previous.dispose()
    changed = true
  } else if (!Array.isArray(next)) {
    changed = paint(next, color)
  }
  if (lines.renderOrder !== STRUCTURE_EDGE_ORDER) {
    lines.renderOrder = STRUCTURE_EDGE_ORDER
    changed = true
  }
  return changed
}

function desiredMeshes(root: Object3D, view: string, floorId: string | null): Mesh[] {
  const found: Mesh[] = []
  root.traverse((object) => {
    const mesh = asMesh(object)
    if (!mesh) return
    const kind = structureEdgeKind({
      name: mesh.name,
      parentName: mesh.parent?.name ?? '',
      view,
      floorId,
      visible: isShown(mesh),
      instanced: false,
    })
    if (kind) found.push(mesh)
  })
  return found
}

function reconcile(
  root: Object3D,
  view: string,
  floorId: string | null,
  color: string,
): { count: number; changed: boolean; hostKey: string; slabReady: boolean } {
  const wanted = desiredMeshes(root, view, floorId)
  const hostKey = wanted.map((mesh) => mesh.uuid).join('|')
  const slabReady = wanted.some((mesh) => mesh.name === 'FloorSlab')
  const wantedSet = new Set(wanted)
  let changed = false
  for (const lines of edgeLines(root)) {
    const host = lines.parent
    if (!host || !wantedSet.has(host as Mesh)) {
      disposeLines(lines)
      changed = true
    }
  }
  let count = 0
  for (const mesh of wanted) {
    const existing = mesh.children.find((child) => child.name === STRUCTURE_EDGE_NAME) as LineSegments | undefined
    if (!existing) {
      if (attach(mesh, color)) {
        count += 1
        changed = true
      }
      continue
    }
    if (refresh(mesh, existing, color)) changed = true
    count += 1
  }
  if (suppressWireframe(root)) changed = true
  if (count === 0) disposeShared()
  return { count, changed, hostKey, slabReady }
}

export function syncStructureEdges(options: SyncOptions = {}): number {
  const state = useTwinStore.getState()
  const mode = structureOverlayFrom(state.layers)
  const root = options.root ?? (typeof window === 'undefined' ? undefined : window.__twinScene)
  const schedule = options.schedule !== false && options.root == null

  if (mode !== 'edges') {
    const changed = root ? clearEdges(root) : false
    if (schedule) stopRetry()
    resetHostWatch()
    publish(mode, 0)
    if (changed) requestFrame()
    return 0
  }

  if (!root) {
    publish(mode, 0)
    if (schedule) scheduleRetry()
    return 0
  }

  const external = schedule && options.reason !== 'retry'
  if (external) {
    stopRetry()
    holdUntil = state.view === 'floor' ? performance.now() + FLOOR_HOLD_MS : 0
  }

  const { count, changed, hostKey, slabReady } = reconcile(
    root,
    state.view,
    state.selectedFloor,
    structureEdgeColor(state),
  )
  if (hostKey === lastHostKey) hostStable += 1
  else {
    hostStable = 0
    lastHostKey = hostKey
  }
  // 单层楼板经常比层带晚进场景。层带先凑满 count 时不能停，否则楼板再也挂不上。
  if (external && state.view === 'floor') hostStable = 0
  publish('edges', count)
  if (changed) requestFrame()
  if (changed && schedule) scheduleFrameFollowUp()
  if (!schedule) return count
  const holding = performance.now() < holdUntil
  const hostsReady = state.view !== 'floor' || slabReady
  const settled = hostsReady && !holding && hostStable >= 1 && count > 0
  if (settled) stopRetry()
  else scheduleRetry()
  return count
}

export function resetStructureEdgesForTests(): void {
  stopRetry()
  resetHostWatch()
  if (typeof window !== 'undefined' && followUp) window.cancelAnimationFrame(followUp)
  followUp = 0
  disposeShared()
}
