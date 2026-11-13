import { createElement, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import { cubeProbeDueLatched, cubeProbeOptInAtBoot, cubeProbeState, type CubeProbeQuery, type CubeProbeState } from './plan'
import { publishCubeProbe } from './probe'

/**
 * T129：探针开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 立方体相机再等用户打开、并且人已经在单层里才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不调用 invalidate。
 */

type Live = (props: { floorId: string }) => ReactNode

let started = false
let optIn = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readQuery(): CubeProbeQuery {
  const state = useTwinStore.getState()
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
  due = cubeProbeDueLatched(due, window.__twinFirstFrameAt, performance.now())
  return {
    optIn,
    due,
    view: state.view,
    floorId: state.selectedFloor,
    touring: window.__vpT === true,
    exploded: state.exploded === true || explode?.exploded === true,
    explodeProgress: progress,
    explodeAnimating: motion?.animating === true,
    stationActive: station?.active === true,
    stationAnimating: station?.animating === true,
    stationProgress: typeof station?.progress === 'number' ? station.progress : 0,
  }
}

function commit(node: ReactNode, show: boolean): boolean {
  window.__twinCubeProbeNode = node
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
  loading ??= import('./CubeProbe').then((mod) => {
    live = mod.CubeProbe
  })
  await loading
}

function publishFor(query: CubeProbeQuery, state: CubeProbeState, on: boolean): void {
  const prev = window.__twinCubeProbe
  const kept = on && prev?.floorId === query.floorId && prev.baked === true
  publishCubeProbe({
    switchOn: query.optIn,
    on,
    mounted: kept ? prev.mounted === true : false,
    baked: kept,
    stopped: kept ? prev.stopped === true : false,
    updates: kept ? prev.updates : 0,
    state,
    floorId: on ? query.floorId : null,
    mesh: kept ? prev.mesh : null,
    far: kept ? prev.far : null,
  })
}

async function refresh(): Promise<void> {
  const query = readQuery()
  const state = cubeProbeState(query)
  const next = state === 'on' ? `on:${query.floorId}` : state
  if (next === signature) return
  const mine = ++token
  signature = next
  if (state !== 'on' || !query.floorId) {
    const placed = commit(null, false)
    publishFor(query, state, false)
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live || cubeProbeState(readQuery()) !== 'on') {
    if (mine === token) signature = ''
    return
  }
  const placed = commit(createElement(live, { floorId: query.floorId }), true)
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  publishFor(query, 'on', true)
}

function paintButton(): void {
  const button = document.querySelector<HTMLButtonElement>('[data-cube-probe-toggle]')
  if (!button) return
  const label = optIn ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(optIn) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(optIn))
  button.setAttribute('aria-label', '近场反射')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '反射'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-cube-probe]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.cubeProbe = ''
    host.setAttribute('aria-label', '近场反射')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.cubeProbeToggle = ''
    button.title = '给当前房间的玻璃烘一张立方体贴图，烘完即停。默认关'
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

/** dock 晚加载之后调用。默认不请求立方体相机。 */
export function mountCubeProbe(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optIn = cubeProbeOptInAtBoot(location.search, navigation?.name ?? '')
  publishFor(readQuery(), cubeProbeState(readQuery()), false)
  window.__twinSetCubeProbe = (on) => {
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
