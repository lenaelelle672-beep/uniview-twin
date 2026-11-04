import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  radialShadowDeskIds,
  radialShadowDueLatched,
  radialShadowOptInAtBoot,
  radialShadowState,
  selectedDeskId,
  type RadialShadowGate,
  type RadialShadowState,
} from './plan'
import { publishRadialShadow } from './probe'

/**
 * T120：径向落地影开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei Shadow 再等用户打开、单层、并且工位表已经公布才加载。
 * 不进 hardGate / balancedFx。默认定时器只复查门闩，不调用 invalidate。
 */

type Live = (props: { floorId: string; deskKey: string }) => ReactNode

let started = false
let optIn = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function floorDesks(floorId: string | null): { id: string }[] {
  if (!floorId) return []
  const probe = window.__twinFloor
  if (!probe || probe.floorId !== floorId) return []
  return probe.desks
}

function readScene(): { gate: RadialShadowGate; selectedId: string | null; deskIds: string[] } {
  const state = useTwinStore.getState()
  const box = window.__twinBoxSelect
  const explode = window.__twinExplode
  const motion = window.__twinReadExplodeMotion?.()
  const station = window.__twinStationExplode
  const storeProgress = state.explodeProgress
  const progress =
    typeof motion?.progress === 'number'
      ? motion.progress
      : typeof explode?.progress === 'number'
        ? explode.progress
        : typeof storeProgress === 'number'
          ? storeProgress
          : 0
  due = radialShadowDueLatched(due, window.__twinFirstFrameAt, performance.now())
  const floorId = state.selectedFloor
  const desks = floorDesks(floorId)
  const selectedId = selectedDeskId(floorId, state.focusedDeskId, box?.floorId ?? null, box?.deskIds ?? [])
  const gate: RadialShadowGate = {
    view: state.view,
    floorId,
    optIn,
    due,
    exploded: state.exploded === true || explode?.exploded === true,
    explodeProgress: progress,
    explodeAnimating: motion?.animating === true,
    stationActive: station?.active === true,
    stationAnimating: station?.animating === true,
    stationProgress: typeof station?.progress === 'number' ? station.progress : 0,
    deskCount: desks.length,
  }
  const viewState = radialShadowState(gate)
  const deskIds = viewState === 'on' ? radialShadowDeskIds(desks, selectedId) : []
  return { gate, selectedId, deskIds }
}

function commit(node: ReactNode, show: boolean): boolean {
  window.__twinRadialShadowNode = node
  const flushed = window.__twinSceneOverlayFlush?.() === true
  if (!flushed) return false
  if (show !== shown) {
    shown = show
    void window.__twinInvalidate?.()
  }
  return true
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./RadialShadows').then((mod) => {
    live = mod.RadialShadows
  })
  await loading
}

function publishFor(gate: RadialShadowGate, state: RadialShadowState, deskIds: readonly string[], on: boolean): void {
  const prev = window.__twinRadialShadow
  const sameDesks = prev?.deskIds.join('|') === deskIds.join('|')
  publishRadialShadow({
    switchOn: gate.optIn,
    on,
    mounted: on && sameDesks && prev?.mounted === true,
    state,
    floorId: gate.floorId,
    count: on && sameDesks ? (prev?.count ?? 0) : 0,
    deskIds,
  })
}

async function refresh(): Promise<void> {
  const scene = readScene()
  const state = radialShadowState(scene.gate)
  const deskIds = scene.deskIds
  const show = state === 'on' && deskIds.length > 0 && scene.gate.floorId != null
  const next = show ? `on:${scene.gate.floorId}:${deskIds.join('|')}` : state
  if (next === signature) return
  const mine = ++token
  signature = next
  if (!show || !scene.gate.floorId) {
    const placed = commit(null, false)
    publishFor(scene.gate, state, [], false)
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  const again = readScene()
  if (mine !== token || !live || radialShadowState(again.gate) !== 'on' || again.deskIds.join('|') !== deskIds.join('|')) {
    if (mine === token) signature = ''
    return
  }
  const placed = commit(
    createElement(Suspense, { fallback: null }, createElement(live, { floorId: scene.gate.floorId, deskKey: deskIds.join('|') })),
    true,
  )
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  publishFor(again.gate, 'on', deskIds, true)
}

function paintButton(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-radial-shadow-toggle]')
  if (!button) return
  const label = optIn ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(optIn) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(optIn))
  button.setAttribute('aria-label', '家具落地影')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '落地影'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-radial-shadow]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.radialShadow = ''
    host.setAttribute('aria-label', '家具落地影')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.radialShadowToggle = ''
    button.title = '给少量桌椅和当前选中工位加一块径向贴地阴影。默认关。不是接触阴影，也不是软阴影。'
    button.addEventListener('click', () => {
      setOptIn(!optIn)
    })
    list.append(button)
    host.append(list)
    const dock = row.querySelector('.viewmark-dock')
    if (dock) row.insertBefore(host, dock)
    else row.append(host)
  }
  paintButton()
}

function setOptIn(next: boolean): void {
  if (next === optIn) return
  optIn = next
  signature = ''
  paintButton()
  void refresh()
}

/** dock 晚加载之后调用。默认不请求 drei Shadow。 */
export function mountRadialShadow(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optIn = radialShadowOptInAtBoot(location.search, navigation?.name ?? '')
  const scene = readScene()
  publishFor(scene.gate, radialShadowState(scene.gate), [], false)
  window.__twinSetRadialShadow = (on) => {
    setOptIn(on)
  }
  ensureButton()
  void refresh()
  useTwinStore.subscribe(() => {
    void refresh()
  })
  const observer = new MutationObserver(() => {
    ensureButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(() => {
    void refresh()
  }, 200)
}
