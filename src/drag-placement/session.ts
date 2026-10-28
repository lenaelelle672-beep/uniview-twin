import { DRAG_AXIS, DRAG_SPOTS, handleOf, movedCount, type DragKind, type Vec3 } from './plan'

/**
 * 作者态落点草稿。关了再开仍留着这一次拖过的位置。
 * 不写工位公式，也不进观众默认的首屏。
 */

export interface DragPlaceProbe {
  id: string
  kind: DragKind
  x: number
  y: number
  z: number
}

export interface DragProbe {
  on: boolean
  mounted: boolean
  dragging: boolean
  owner: 'drag' | 'camera-controls'
  axisLock: 'y'
  devices: number
  furniture: number
  count: number
  latched: boolean
  moved: number
  places: DragPlaceProbe[]
  setOn?: (on: boolean) => void
}

interface DragState {
  places: Map<string, Vec3>
  on: boolean
  mounted: boolean
  dragging: boolean
  latched: boolean
  toggle?: (next: boolean) => void
}

const host = globalThis as { __twinDragState?: DragState }

/**
 * DragMount.js 和 DragControls.js 各打一份本模块。
 * 状态放在 globalThis，避免后加载的那份把探针写成关。
 */
function state(): DragState {
  host.__twinDragState ??= {
    places: new Map(),
    on: false,
    mounted: false,
    dragging: false,
    latched: false,
  }
  return host.__twinDragState
}

export function seedPlaces(): void {
  const places = state().places
  for (const spot of DRAG_SPOTS) {
    if (!places.has(spot.id)) places.set(spot.id, handleOf(spot))
  }
}

export function placeOf(id: string): Vec3 {
  seedPlaces()
  const found = state().places.get(id)
  if (!found) throw new Error(`未知落点 ${id}`)
  return found
}

export function placementMap(): ReadonlyMap<string, Vec3> {
  seedPlaces()
  return state().places
}

export function commitPlace(id: string, next: Vec3): void {
  state().places.set(id, { x: next.x, y: next.y, z: next.z })
  publishDragProbe()
}

export function setDragFlags(next: { on?: boolean; mounted?: boolean; dragging?: boolean; latched?: boolean }): void {
  const current = state()
  if (next.on != null) current.on = next.on
  if (next.mounted != null) current.mounted = next.mounted
  if (next.dragging != null) current.dragging = next.dragging
  if (next.latched != null) current.latched = next.latched
  if (!current.on) {
    current.mounted = false
    current.dragging = false
    current.latched = false
  }
  publishDragProbe()
}

export function bindDragToggle(fn: (next: boolean) => void): void {
  state().toggle = fn
  publishDragProbe()
}

export function dragSessionSnapshot(): { on: boolean; mounted: boolean; dragging: boolean; latched: boolean } {
  const current = state()
  return { on: current.on, mounted: current.mounted, dragging: current.dragging, latched: current.latched }
}

export function resetDragSessionForTests(): void {
  delete host.__twinDragState
  if (typeof window !== 'undefined') delete window.__twinDrag
}

function placeList(): DragPlaceProbe[] {
  const current = state()
  if (!current.on || !current.mounted) return []
  return DRAG_SPOTS.map((spot) => {
    const place = current.places.get(spot.id) ?? handleOf(spot)
    return { id: spot.id, kind: spot.kind, x: place.x, y: place.y, z: place.z }
  })
}

export function publishDragProbe(): void {
  if (typeof window === 'undefined') return
  seedPlaces()
  const current = state()
  const live = current.on && current.mounted
  const probe: DragProbe = {
    on: current.on,
    mounted: live,
    dragging: current.on && current.dragging,
    owner: current.on && (current.dragging || current.latched) ? 'drag' : 'camera-controls',
    axisLock: DRAG_AXIS,
    devices: live ? DRAG_SPOTS.filter((spot) => spot.kind === 'device').length : 0,
    furniture: live ? DRAG_SPOTS.filter((spot) => spot.kind === 'furniture').length : 0,
    count: live ? DRAG_SPOTS.length : 0,
    latched: current.on && current.latched,
    moved: live ? movedCount(current.places) : 0,
    places: placeList(),
    setOn: current.toggle,
  }
  window.__twinDrag = probe
}
