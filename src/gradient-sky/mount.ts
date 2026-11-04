import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  gradientSkyDueLatched,
  gradientSkyOptOutAtBoot,
  gradientSkyState,
  type GradientSkyGate,
  type GradientSkyState,
} from './plan'
import { publishGradientSky } from './probe'

/**
 * T114：天幕开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei GradientTexture 再等昼间总览、并且过了同一道 2600ms 窗口才加载。
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

function readGate(): GradientSkyGate {
  const state = useTwinStore.getState()
  return {
    view: state.view,
    dayNight: state.dayNight,
    presentation: state.presentation,
    optOut,
  }
}

function currentState(): GradientSkyState {
  const state = gradientSkyState(readGate())
  due = gradientSkyDueLatched(due, window.__twinFirstFrameAt, performance.now())
  if (state === 'on' && !due) return 'pending'
  return state
}

function wanted(): boolean {
  return currentState() === 'on'
}

function commit(node: ReactNode, on: boolean): boolean {
  window.__twinGradientSkyNode = node
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
  loading ??= import('./GradientSky').then((mod) => {
    live = mod.GradientSky
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
    publishGradientSky(false, false, currentState())
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
  publishGradientSky(true, window.__twinGradientSky?.mounted === true, 'on')
}

/** dock 晚加载之后调用。夜景、白模、单层和 `?skyGradient=0` 都不加载 GradientTexture。 */
export function mountGradientSky(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optOut = gradientSkyOptOutAtBoot(location.search, navigation?.name ?? '')
  publishGradientSky(false, false, currentState())
  window.__twinSetGradientSky = (on) => {
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
