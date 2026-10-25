import { createElement, Fragment, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  acceptsFocusKey,
  focusFitBlock,
  holdViewpointFlag,
  planFocusTarget,
  pumpUntilSettled,
  readOrbitPose,
  type FocusPlan,
  type FocusSubject,
  type OrbitPose,
} from './plan'

/**
 * T070：对焦装入的开关。
 * dock 在首帧 2600ms 之后才 import 本文件。Center / Bounds 再等按键才加载。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去，因此不进 hardGate / balancedFx。
 * C 走 Center。Shift+C 才是讲解对焦，才会加载 Bounds。
 */

type Slot = ((node: ReactNode) => void) & {
  __focusBridge?: boolean
  __gridBridge?: boolean
  __decalBridge?: boolean
}

type Mode = 'off' | 'center' | 'bounds'
type Blocked = '' | 'tour' | 'blueprint' | 'empty' | 'missing'
type FitResult = 'fitted' | 'empty' | 'missing'

let started = false
let mode: Mode = 'off'
let epoch = 0
let saved: OrbitPose | null = null
let releaseFlag: (() => void) | null = null
let stopPump: (() => void) | null = null
let focusNode: ReactNode = null
let measureNode: ReactNode = null
let rawSlot: ((node: ReactNode) => void) | null = null
let bridge: Slot | null = null
let centerLive = false
let boundsLive = false
let centerLoaded = false
let boundsLoaded = false
let subjectKind: FocusSubject | null = null
let blocked: Blocked = ''
let committed = false

const published = {
  resident: false,
  center: false,
  bounds: false,
  centerLoaded: false,
  boundsLoaded: false,
  mode: 'off' as Mode,
  subject: null as FocusSubject | null,
  handedBack: true,
  blocked: '' as Blocked,
}

export function composeFocus(measure: ReactNode, focus: ReactNode): ReactNode {
  if (measure != null && focus != null) return createElement(Fragment, null, measure, focus)
  return measure ?? focus ?? null
}

function publish(): void {
  published.resident = centerLive || boundsLive
  published.center = centerLive
  published.bounds = boundsLive
  published.centerLoaded = centerLoaded
  published.boundsLoaded = boundsLoaded
  published.mode = mode
  published.subject = subjectKind
  published.handedBack = !boundsLive
  published.blocked = blocked
  window.__twinFocusFit = {
    resident: published.resident,
    center: published.center,
    bounds: published.bounds,
    centerLoaded: published.centerLoaded,
    boundsLoaded: published.boundsLoaded,
    mode: published.mode,
    subject: published.subject,
    handedBack: published.handedBack,
    blocked: published.blocked,
  }
}

function invalidate(): void {
  window.__vpP?.()
}

/** 上一次 fit 留下的速度会把回程带偏。交还前先清掉，不改镜头缓动时长。 */
function calmOrbit(rig: NonNullable<Window['__twinRig']>): void {
  const orbit = rig as NonNullable<Window['__twinRig']> & {
    _thetaVelocity?: { value: number }
    _phiVelocity?: { value: number }
    _radiusVelocity?: { value: number }
    _zoomVelocity?: { value: number }
    _targetVelocity?: { set: (x: number, y: number, z: number) => void }
    _focalOffsetVelocity?: { set: (x: number, y: number, z: number) => void }
  }
  if (orbit._thetaVelocity) orbit._thetaVelocity.value = 0
  if (orbit._phiVelocity) orbit._phiVelocity.value = 0
  if (orbit._radiusVelocity) orbit._radiusVelocity.value = 0
  if (orbit._zoomVelocity) orbit._zoomVelocity.value = 0
  orbit._targetVelocity?.set(0, 0, 0)
  orbit._focalOffsetVelocity?.set(0, 0, 0)
}

function clearPump(): void {
  stopPump?.()
  stopPump = null
}

function releaseHold(): void {
  releaseFlag?.()
  releaseFlag = null
}

function flush(): void {
  if (!rawSlot) return
  rawSlot(composeFocus(measureNode, focusNode))
}

function queryFromStore() {
  const state = useTwinStore.getState()
  const box = window.__twinBoxSelect
  return {
    view: state.view,
    floorId: state.selectedFloor,
    focusedDeskId: state.focusedDeskId,
    boxFloorId: box?.floorId ?? null,
    boxDeskIds: box?.deskIds ?? [],
  }
}

function restore(): void {
  epoch += 1
  const pose = saved
  const wasBounds = boundsLive
  const wasCommitted = committed
  saved = null
  committed = false
  clearPump()
  centerLive = false
  boundsLive = false
  focusNode = null
  flush()
  releaseHold()
  const rig = window.__twinRig
  if (rig && pose && (!wasBounds || wasCommitted)) {
    calmOrbit(rig)
    const done = rig.setLookAt(pose.px, pose.py, pose.pz, pose.tx, pose.ty, pose.tz, true)
    stopPump = pumpUntilSettled(done, invalidate)
  } else {
    invalidate()
  }
  mode = 'off'
  subjectKind = null
  blocked = ''
  publish()
  paintButton()
}

function fail(kind: Blocked): void {
  blocked = kind
  mode = 'off'
  subjectKind = null
  centerLive = false
  boundsLive = false
  focusNode = null
  saved = null
  committed = false
  clearPump()
  releaseHold()
  flush()
  publish()
  paintButton()
}

function begin(kind: Mode, plan: FocusPlan): boolean {
  const rig = window.__twinRig
  if (!rig) {
    fail('missing')
    return false
  }
  saved = readOrbitPose(rig)
  mode = kind
  subjectKind = plan.kind
  blocked = ''
  committed = false
  if (kind === 'center') releaseFlag = holdViewpointFlag()
  publish()
  return true
}

async function startCenter(): Promise<void> {
  const mine = ++epoch
  const state = queryFromStore()
  const block = focusFitBlock(state.view, window.__vpT === true)
  if (block) {
    fail(block)
    return
  }
  const plan = planFocusTarget(state)
  if (!plan) {
    fail('empty')
    return
  }
  if (!begin('center', plan)) return
  let mod: typeof import('./CenterFit')
  try {
    mod = await import('./CenterFit')
  } catch {
    if (mine === epoch) fail('missing')
    return
  }
  if (mine !== epoch) return
  centerLoaded = true
  centerLive = true
  focusNode = createElement(mod.CenterFit, {
    plan,
    onLive: (live) => {
      if (mine !== epoch) return
      centerLive = live
      publish()
    },
    onDone: (result: FitResult) => {
      if (mine !== epoch) return
      centerLive = false
      focusNode = null
      flush()
      releaseHold()
      if (result === 'fitted') {
        committed = true
        blocked = ''
      } else {
        const pose = saved
        saved = null
        committed = false
        mode = 'off'
        subjectKind = null
        blocked = result === 'empty' ? 'empty' : 'missing'
        const rig = window.__twinRig
        if (rig && pose) void rig.setLookAt(pose.px, pose.py, pose.pz, pose.tx, pose.ty, pose.tz, false)
      }
      publish()
      paintButton()
    },
  })
  flush()
  publish()
  paintButton()
}

async function startBounds(): Promise<void> {
  const mine = ++epoch
  const state = queryFromStore()
  const block = focusFitBlock(state.view, window.__vpT === true)
  if (block) {
    fail(block)
    return
  }
  const plan = planFocusTarget(state)
  if (!plan) {
    fail('empty')
    return
  }
  if (!begin('bounds', plan)) return
  let mod: typeof import('./BoundsFit')
  try {
    mod = await import('./BoundsFit')
  } catch {
    if (mine === epoch) fail('missing')
    return
  }
  if (mine !== epoch) return
  boundsLoaded = true
  boundsLive = true
  focusNode = createElement(mod.BoundsFit, {
    plan,
    onLive: (live) => {
      if (mine !== epoch) return
      boundsLive = live
      publish()
    },
    onDone: (result: FitResult) => {
      if (mine !== epoch) return
      boundsLive = false
      focusNode = null
      flush()
      if (result === 'fitted') {
        committed = true
        blocked = ''
      } else {
        saved = null
        committed = false
        mode = 'off'
        subjectKind = null
        blocked = result === 'empty' ? 'empty' : 'missing'
      }
      publish()
      paintButton()
    },
  })
  flush()
  publish()
  paintButton()
}

function onTrigger(kind: 'center' | 'bounds'): void {
  if (mode !== 'off') {
    restore()
    return
  }
  if (kind === 'bounds') void startBounds()
  else void startCenter()
}

function paintButton(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-focus-fit-toggle]')
  if (!button) return
  const on = mode !== 'off'
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '对焦装入')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '装入'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-focus-fit]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.focusFit = ''
    host.setAttribute('aria-label', '对焦装入')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.focusFitToggle = ''
    button.title = 'C 装入当前层或选中工位。Shift+C 讲解对焦。再按一次或 Esc 恢复。默认不包整栋楼'
    button.addEventListener('click', (event) => {
      onTrigger(event.shiftKey ? 'bounds' : 'center')
    })
    list.append(button)
    host.append(list)
    const dock = row.querySelector('.viewmark-dock')
    if (dock) row.insertBefore(host, dock)
    else row.append(host)
  }
  paintButton()
}

function wrapMeasureSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__focusBridge) return
  if (bridge) {
    if (current.__gridBridge || current.__decalBridge) return
    bridge = null
  }
  const upstream = current
  rawSlot = upstream
  const wrapped: Slot = (node) => {
    measureNode = node
    flush()
  }
  wrapped.__focusBridge = true
  if (upstream.__gridBridge) wrapped.__gridBridge = true
  if (upstream.__decalBridge) wrapped.__decalBridge = true
  bridge = wrapped
  window.__twinMeasureSlot = wrapped
  if (mode !== 'off') flush()
}

function installEscape(): void {
  const previous = window.__twinDismissEsc
  window.__twinDismissEsc = () => {
    if (mode !== 'off') {
      restore()
      return true
    }
    return previous?.() ?? false
  }
}

function onKey(event: KeyboardEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null
  const partial = {
    key: event.key,
    repeat: event.repeat,
    altKey: event.altKey,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    isComposing: event.isComposing,
    target,
  }
  if (acceptsFocusKey(partial, 'narration')) {
    event.preventDefault()
    onTrigger('bounds')
    return
  }
  if (acceptsFocusKey(partial, 'center')) {
    event.preventDefault()
    onTrigger('center')
  }
}

/** dock 晚加载之后调用。默认不请求 Center 或 Bounds。 */
export function mountFocusFit(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  publish()
  ensureButton()
  wrapMeasureSlot()
  installEscape()
  window.addEventListener('keydown', onKey)
  const observer = new MutationObserver(() => {
    ensureButton()
    wrapMeasureSlot()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(wrapMeasureSlot, 200)
}
