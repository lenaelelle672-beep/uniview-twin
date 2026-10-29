import { CYCLE_KEY_CODE, CYCLE_SCROLL, type CycleFocus, type CycleLayerName } from './policy'

/**
 * T086 探针。CycleMount.js 和 CycleRaycast.js 各打一份本模块。
 * 状态放在 globalThis，避免后加载的那份把 window.__twinCycle 写成关。
 */

export interface CycleProbe {
  on: boolean
  mounted: boolean
  armed: boolean
  keyCode: 9
  scroll: false
  hits: number
  cycle: number
  deskId: string | null
  deviceId: string | null
  instanceId: number | null
  layer: CycleLayerName | null
  blocked: string
  hold: boolean
  setOn?: (on: boolean) => void
}

interface CycleState {
  on: boolean
  mounted: boolean
  hold: boolean
  hits: number
  cycle: number
  deskId: string | null
  deviceId: string | null
  instanceId: number | null
  layer: CycleLayerName | null
  blocked: string
  pointerDown: boolean
  pointerOnCanvas: boolean
  boxSelecting: boolean
  toggle?: (next: boolean) => void
}

const host = globalThis as { __twinCycleState?: CycleState }

function fresh(): CycleState {
  return {
    on: false,
    mounted: false,
    hold: false,
    hits: 0,
    cycle: 0,
    deskId: null,
    deviceId: null,
    instanceId: null,
    layer: null,
    blocked: '',
    pointerDown: false,
    pointerOnCanvas: false,
    boxSelecting: false,
  }
}

function state(): CycleState {
  host.__twinCycleState ??= fresh()
  return host.__twinCycleState
}

export function setCycleFlags(next: { on?: boolean; mounted?: boolean; hold?: boolean }): void {
  const current = state()
  if (next.on != null) current.on = next.on
  if (next.mounted != null) current.mounted = next.mounted
  if (next.hold != null) current.hold = next.hold
  if (!current.on) {
    current.mounted = false
    current.hold = false
    current.hits = 0
    current.cycle = 0
    current.deskId = null
    current.deviceId = null
    current.instanceId = null
    current.layer = null
    current.blocked = ''
  }
  publishCycleProbe()
}

export function setCyclePointer(next: { pointerDown?: boolean; pointerOnCanvas?: boolean; boxSelecting?: boolean }): void {
  const current = state()
  if (next.pointerDown != null) current.pointerDown = next.pointerDown
  if (next.pointerOnCanvas != null) current.pointerOnCanvas = next.pointerOnCanvas
  if (next.boxSelecting != null) current.boxSelecting = next.boxSelecting
}

export function activitySnapshot(): {
  dragging: boolean
  pointerDown: boolean
  boxSelecting: boolean
  pointerOnCanvas: boolean
} {
  const drag = (globalThis as { __twinDrag?: { dragging?: boolean; latched?: boolean } }).__twinDrag
  const current = state()
  return {
    dragging: drag?.dragging === true || drag?.latched === true,
    pointerDown: current.pointerDown,
    boxSelecting: current.boxSelecting,
    pointerOnCanvas: current.pointerOnCanvas,
  }
}

export function noteCycle(hits: number, cycle: number, focus: CycleFocus | null): void {
  const current = state()
  current.hits = hits
  current.cycle = Number.isFinite(cycle) ? cycle : 0
  current.deskId = focus?.deskId ?? null
  current.deviceId = focus?.deviceId ?? null
  current.instanceId = focus?.instanceId ?? null
  current.layer = focus?.layer ?? null
  current.blocked = ''
  publishCycleProbe()
}

export function noteBlocked(reason: string): void {
  state().blocked = reason
  publishCycleProbe()
}

export function bindCycleToggle(fn: (next: boolean) => void): void {
  state().toggle = fn
  publishCycleProbe()
}

export function publishCycleProbe(): void {
  if (typeof window === 'undefined') return
  const current = state()
  const live = current.on && current.mounted && !current.hold
  const probe: CycleProbe = {
    on: current.on,
    mounted: current.on && current.mounted,
    armed: live,
    keyCode: CYCLE_KEY_CODE,
    scroll: CYCLE_SCROLL,
    hits: current.on ? current.hits : 0,
    cycle: current.on ? current.cycle : 0,
    deskId: current.on ? current.deskId : null,
    deviceId: current.on ? current.deviceId : null,
    instanceId: current.on ? current.instanceId : null,
    layer: current.on ? current.layer : null,
    blocked: current.on ? current.blocked : '',
    hold: current.on && current.hold,
    setOn: current.toggle,
  }
  window.__twinCycle = probe
}

export function resetCycleSessionForTests(): void {
  delete host.__twinCycleState
  if (typeof window !== 'undefined') delete window.__twinCycle
}
