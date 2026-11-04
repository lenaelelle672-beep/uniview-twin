import { createElement, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  resizeDeskId,
  resizeFitDueLatched,
  resizeFitOptInAtBoot,
  resizeFitState,
  type ResizeFitState,
  type ResizeQuery,
} from './plan'
import { publishResizeFit } from './probe'

/**
 * T117：缩放开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei Resize 再等用户打开、并且只剩一枚选中工位时才加载。
 * 不进 hardGate / balancedFx。默认定时器只复查门闩，不调用 invalidate。
 */

type Live = (props: { floorId: string; deskId: string; nonce: string }) => ReactNode

let started = false
let optIn = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readQuery(): ResizeQuery {
  const state = useTwinStore.getState()
  const box = window.__twinBoxSelect
  const focus = window.__twinFocusFit
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
  due = resizeFitDueLatched(due, window.__twinFirstFrameAt, performance.now())
  return {
    view: state.view,
    floorId: state.selectedFloor,
    focusedDeskId: state.focusedDeskId,
    boxFloorId: box?.floorId ?? null,
    boxDeskIds: box?.deskIds ?? [],
    optIn,
    due,
    touring: window.__vpT === true,
    focusMode: focus?.mode ?? 'off',
    focusResident: focus?.resident === true || focus?.center === true || focus?.bounds === true,
    exploded: state.exploded === true || explode?.exploded === true,
    explodeProgress: progress,
    explodeAnimating: motion?.animating === true,
    stationActive: station?.active === true,
    stationAnimating: station?.animating === true,
    stationProgress: typeof station?.progress === 'number' ? station.progress : 0,
  }
}

/**
 * 镜头停住之后签名不变，定时器不会再要帧。
 * 飞近楼层时每 4 米更新一次，避免首帧还在总览机位就把载体撑到上限。
 */
function cameraNonce(): string {
  const rig = window.__twinRig
  const camera = rig?.camera
  if (!camera) return ''
  const position = camera.position
  const fov = Math.round(camera.fov)
  return `${fov}:${Math.round(position.x / 4)}:${Math.round(position.y / 4)}:${Math.round(position.z / 4)}`
}

function placementReady(query: ResizeQuery, deskId: string | null): boolean {
  if (!deskId || !query.floorId) return false
  // B1 不公布 __twinFloor，落点走楼板公式。地上层要等室内把工位坐标交出来。
  if (query.floorId === 'B1') return true
  const probe = window.__twinFloor
  return probe?.floorId === query.floorId && probe.desks.some((desk) => desk.id === deskId)
}

function commit(node: ReactNode, show: boolean): boolean {
  window.__twinResizeFitNode = node
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
  loading ??= import('./ResizeFit').then((mod) => {
    live = mod.ResizeFit
  })
  await loading
}

function publishFor(query: ResizeQuery, state: ResizeFitState, deskId: string | null, on: boolean): void {
  publishResizeFit({
    switchOn: query.optIn,
    on,
    mounted: false,
    state,
    deskId,
    floorId: query.floorId,
    meters: null,
  })
}

async function refresh(): Promise<void> {
  const query = readQuery()
  const state = resizeFitState(query)
  const deskId = resizeDeskId(query)
  const ready = state === 'on' && placementReady(query, deskId)
  const nonce = state === 'on' && ready ? cameraNonce() : ''
  const next = state === 'on' ? `on:${query.floorId}:${deskId}:${ready ? 1 : 0}:${nonce}` : state
  if (next === signature) return
  const mine = ++token
  signature = next
  if (state !== 'on' || !deskId || !query.floorId || !ready) {
    const placed = commit(null, false)
    publishFor(query, state, null, false)
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live || resizeFitState(readQuery()) !== 'on') {
    if (mine === token) signature = ''
    return
  }
  const placed = commit(createElement(live, { floorId: query.floorId, deskId, nonce }), true)
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  const prev = window.__twinResizeFit
  const kept = prev?.deskId === deskId
  publishResizeFit({
    switchOn: query.optIn,
    on: true,
    mounted: kept && prev?.mounted === true,
    state: 'on',
    deskId,
    floorId: query.floorId,
    meters: kept ? (prev?.meters ?? null) : null,
  })
}

function paintButton(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-resize-fit-toggle]')
  if (!button) return
  const label = optIn ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(optIn) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(optIn))
  button.setAttribute('aria-label', '缩放选中件')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '缩放'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-resize-fit]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.resizeFit = ''
    host.setAttribute('aria-label', '缩放选中件')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.resizeFitToggle = ''
    button.title = '把单枚选中工位的演示载体缩放到视口里。不移动镜头。对焦装入、爆炸和工位拆解时让位。默认关'
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

/** dock 晚加载之后调用。默认不请求 drei Resize。 */
export function mountResizeFit(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optIn = resizeFitOptInAtBoot(location.search, navigation?.name ?? '')
  publishFor(readQuery(), resizeFitState(readQuery()), null, false)
  window.__twinSetResizeFit = (on) => {
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
