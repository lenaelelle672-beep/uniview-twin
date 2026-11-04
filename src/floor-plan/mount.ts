import { createElement, Fragment, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  captureReadyMarks,
  notePresented,
  readyMarksLost,
  rememberReadyMarks,
  restoreReadyMarks,
  type ReadyMarks,
} from './marks'
import { acceptsFloorPlanKey, floorPlanBootOnAt, floorPlanReason, type FloorPlanReason } from './plan'

/**
 * T118：平面图开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei OrthographicCamera 再等会话打开、并且人已经在单层里，才加载。
 * 不进 hardGate / balancedFx。不写地址栏。
 */

type Live = (props: { floorId: string }) => ReactNode

type Slot = ((node: ReactNode) => void) & { __floorPlanBridge?: boolean }

let started = false
let sessionOn = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let raw: Slot | null = null
let seen: ReactNode = null
let wrapGen = 0
let presented = false
let cameraUp = false
let readyMarks: ReadyMarks | null = null
let sceneRevision = ''

function syncPresented(): void {
  if (notePresented(presented, window.__twinFirstFrameAt)) presented = true
}

function readGate(): { reason: FloorPlanReason; floorId: string | null } {
  syncPresented()
  const state = useTwinStore.getState()
  const station = window.__twinStationExplode
  const motionClaim = (window.__twinRig as { __twinMotionClaim?: boolean } | undefined)?.__twinMotionClaim === true
  const reason = floorPlanReason({
    session: sessionOn,
    view: state.view,
    firstFrame: presented,
    touring: window.__vpT === true || window.__vpH === true,
    motion: window.__twinMotionPath?.playing === true || motionClaim,
    station: station?.active === true || station?.animating === true,
  })
  return { reason, floorId: state.view === 'floor' ? state.selectedFloor : null }
}

function keepReady(): void {
  readyMarks = rememberReadyMarks(readyMarks, captureReadyMarks(window))
}

function sceneRevisionOf(): string {
  const state = useTwinStore.getState()
  return `${state.dayNight}|${state.view}|${state.quality}|${state.presentation}|${state.exploded ? 1 : 0}|${state.selectedFloor ?? ''}`
}

function healReady(): void {
  if (!window.__twinScene || !readyMarks) return
  restoreReadyMarks(window, readyMarks)
}

/** 清理发生在这次提交的 effect 里，比订阅晚。晚一拍再看标记还在不在。 */
function healIfLostSoon(): void {
  keepReady()
  const run = () => {
    keepReady()
    if (readyMarksLost(readyMarks, window)) healReady()
  }
  window.setTimeout(run, 0)
  window.requestAnimationFrame(() => {
    run()
    window.requestAnimationFrame(run)
  })
  window.setTimeout(run, 50)
}

/** 换默认相机会让 RenderProbe 清标记。记在换之前，清完再写回去。 */
function healSoon(): void {
  keepReady()
  const run = () => healReady()
  window.requestAnimationFrame(() => {
    run()
    window.requestAnimationFrame(run)
  })
  window.setTimeout(run, 0)
  window.setTimeout(run, 50)
}

function watchPresented(): void {
  const tick = () => {
    const before = presented
    syncPresented()
    if (!before && presented) void refresh()
    if (!presented) window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
}

function publish(reason: FloorPlanReason, floorId: string | null): void {
  const prev = window.__twinFloorPlan
  // held / mounted 只由正交相机组件在挂上和卸下时改。
  // 卸下之前这里不能先清掉，否则 FloorStageCamera 会拿着正交相机去 fit。
  const mounted = prev?.mounted === true
  window.__twinFloorPlan = {
    on: sessionOn,
    mounted,
    held: prev?.held === true,
    impl: 'drei-OrthographicCamera',
    mode: mounted ? 'ortho' : 'perspective',
    reason,
    floorId,
    zoom: mounted ? (prev?.zoom ?? null) : null,
    waiting: reason === 'on' ? (prev?.waiting ?? null) : null,
    owner: 'camera-controls',
    framing: 'floor-stage',
    cdn: false,
  }
}

function planNode(reason: FloorPlanReason, floorId: string | null): ReactNode {
  if (reason !== 'on' || !live || !floorId) return null
  return createElement(live, { floorId })
}

function push(target: (node: ReactNode) => void, measure: ReactNode, plan: ReactNode): void {
  if (measure != null && plan != null) target(createElement(Fragment, null, measure, plan))
  else target(measure ?? plan ?? null)
}

function wrap(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__floorPlanBridge) return
  const gen = ++wrapGen
  const captured = current
  raw = captured
  const wrapped: Slot = (node) => {
    seen = node
    if (gen !== wrapGen) {
      captured(node)
      return
    }
    const gate = readGate()
    push(captured, node, planNode(gate.reason, gate.floorId))
  }
  const record = captured as unknown as Record<string, unknown>
  const next = wrapped as unknown as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key.startsWith('__')) next[key] = record[key]
  }
  wrapped.__floorPlanBridge = true
  window.__twinMeasureSlot = wrapped
}

function flush(plan: ReactNode): void {
  if (!raw) return
  push(raw, seen, plan)
}

async function loadLive(): Promise<void> {
  if (live) return
  try {
    loading ??= import('./FloorPlanCamera').then((mod) => {
      live = mod.FloorPlanCamera
    })
    await loading
  } catch (error) {
    loading = null
    throw error
  }
}

async function refresh(): Promise<void> {
  const gate = readGate()
  const next = `${gate.reason}:${gate.floorId ?? ''}:${sessionOn ? 1 : 0}`
  if (next === signature && (gate.reason !== 'on' || raw)) return
  const mine = ++token
  signature = next
  publish(gate.reason, gate.floorId)
  paintButton()
  if (gate.reason !== 'on') {
    const wasUp = cameraUp
    cameraUp = false
    if (wasUp) keepReady()
    wrap()
    flush(null)
    if (wasUp) healSoon()
    void window.__twinInvalidate?.()
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live) {
    if (mine === token) signature = ''
    return
  }
  const again = readGate()
  if (again.reason !== 'on') {
    if (mine === token) signature = ''
    return
  }
  wrap()
  keepReady()
  flush(planNode(again.reason, again.floorId))
  cameraUp = true
  publish(again.reason, again.floorId)
  healSoon()
  void window.__twinInvalidate?.()
}

function setSession(on: boolean): void {
  if (on === sessionOn) return
  sessionOn = on
  signature = ''
  void refresh()
}

function paintButton(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-floor-plan] button')
  if (!button) return
  const label = sessionOn ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(sessionOn) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(sessionOn))
  button.setAttribute('aria-label', '平面图')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '平面图'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-floor-plan]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.floorPlan = ''
    host.setAttribute('aria-label', '平面图')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'floorPlan'
    button.title = '单层平面图俯视，快捷键 P。退出回到透视。总览不切换相机。'
    button.addEventListener('click', () => {
      setSession(!sessionOn)
    })
    list.append(button)
    host.append(list)
    const dock = row.querySelector('.viewmark-dock')
    if (dock) row.insertBefore(host, dock)
    else row.append(host)
  }
  paintButton()
}

function onKey(event: KeyboardEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (
    !acceptsFloorPlanKey({
      key: event.key,
      repeat: event.repeat,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      isComposing: event.isComposing,
      target,
    })
  ) {
    return
  }
  event.preventDefault()
  setSession(!sessionOn)
}

/** dock 晚加载之后调用。默认关。`?floorPlan=1` 只在这次会话里打开。 */
export function mountFloorPlan(): void {
  if (typeof document === 'undefined' || started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  sessionOn = floorPlanBootOnAt(location.search, navigation?.name ?? '')
  window.__twinSetFloorPlan = setSession
  window.__twinFloorPlanSync = () => {
    void refresh()
  }
  ensureButton()
  window.addEventListener('keydown', onKey)
  watchPresented()
  sceneRevision = sceneRevisionOf()
  void refresh()
  useTwinStore.subscribe(() => {
    keepReady()
    const next = sceneRevisionOf()
    const sceneChanged = next !== sceneRevision
    sceneRevision = next
    void refresh()
    // 空闲门换过 invalidate 之后，昼夜这次提交会让 RenderProbe 清掉就绪标记。
    // 树不会跟着再画一次，所以清完要写回去。正交相机那条路自己也会补。
    if (sceneChanged) healIfLostSoon()
  })
  window.setInterval(() => {
    ensureButton()
    keepReady()
    void refresh()
    if (readyMarksLost(readyMarks, window)) healReady()
  }, 200)
}
