import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  screenMarkDueLatched,
  screenMarkOptOutAtBoot,
  screenMarkState,
  type ScreenMarkGate,
  type ScreenMarkState,
} from './plan'
import { publishScreenMark } from './probe'

/**
 * T116：屏幕标注开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei ScreenSpace 再等总览实景、并且过了同一道 2600ms 窗口才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不调用 invalidate。
 */

type Live = () => ReactNode

let started = false
let optOut = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readProgress(): number | null {
  const value = window.__twinExplode?.progress
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readGate(): ScreenMarkGate {
  const state = useTwinStore.getState()
  return {
    view: state.view,
    presentation: state.presentation,
    exploded: state.exploded,
    progress: readProgress(),
    optOut,
  }
}

function currentState(): ScreenMarkState {
  const state = screenMarkState(readGate())
  due = screenMarkDueLatched(due, window.__twinFirstFrameAt, performance.now())
  if (state === 'on' && !due) return 'pending'
  return state
}

function wanted(): boolean {
  return currentState() === 'on'
}

function commit(node: ReactNode, on: boolean): boolean {
  window.__twinScreenMarkNode = node
  const flushed = window.__twinSceneOverlayFlush?.() === true
  if (!flushed) return false
  if (on !== shown) {
    shown = on
    void window.__twinInvalidate?.()
  }
  return true
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./ScreenMark').then((mod) => {
    live = mod.ScreenMark
  })
  await loading
}

async function refresh(): Promise<void> {
  const show = wanted()
  const next = show ? 'on' : `off:${currentState()}`
  if (next === signature) return
  const mine = ++token
  signature = next
  if (!show) {
    const placed = commit(null, false)
    publishScreenMark({ on: false, mounted: false, state: currentState(), placement: 'hidden', x: 0, y: 0 })
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live || !wanted()) {
    if (mine === token) signature = ''
    return
  }
  const placed = commit(createElement(Suspense, { fallback: null }, createElement(live)), true)
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  publishScreenMark({
    on: true,
    mounted: window.__twinScreenMark?.mounted === true,
    state: 'on',
    placement: window.__twinScreenMark?.placement ?? 'hidden',
    x: window.__twinScreenMark?.x ?? 0,
    y: window.__twinScreenMark?.y ?? 0,
  })
}

/** dock 晚加载之后调用。白模、单层、爆炸和 `?screenMark=0` 都不加载 ScreenSpace。 */
export function mountScreenMark(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optOut = screenMarkOptOutAtBoot(location.search, navigation?.name ?? '')
  publishScreenMark({ on: false, mounted: false, state: currentState(), placement: 'hidden', x: 0, y: 0 })
  window.__twinSetScreenMark = (on) => {
    optOut = !on
    void refresh()
  }
  void refresh()
  useTwinStore.subscribe(() => {
    void refresh()
  })
  window.setInterval(() => {
    void refresh()
  }, 200)
}
