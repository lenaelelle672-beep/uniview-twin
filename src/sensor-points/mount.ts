import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  sensorPointsDueLatched,
  sensorPointsOptOutAtBoot,
  sensorPointsState,
  type SensorPointsGate,
  type SensorPointsState,
} from './plan'
import { publishSensorPoints } from './probe'

/**
 * T119：点云开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei Points 和 PointMaterial 再等总览、并且过了同一道 2600ms 窗口才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不调用 invalidate。
 * 告警数字变了由点云组件自己补一帧，这里不订阅每次数值。
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

function readGate(): SensorPointsGate {
  return {
    view: useTwinStore.getState().view,
    optOut,
  }
}

function currentState(): SensorPointsState {
  const state = sensorPointsState(readGate(), true)
  due = sensorPointsDueLatched(due, window.__twinFirstFrameAt, performance.now())
  if (state === 'on' && !due) return 'pending'
  return state
}

function wanted(): boolean {
  return currentState() === 'on'
}

function commit(node: ReactNode, on: boolean): boolean {
  window.__twinSensorPointsNode = node
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
  loading ??= import('./SensorCloud').then((mod) => {
    live = mod.SensorCloud
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
    publishSensorPoints({ on: false, mounted: false, state: currentState() })
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
  publishSensorPoints({
    on: true,
    mounted: window.__twinSensorPoints?.mounted === true,
    state: 'on',
  })
}

/** dock 晚加载之后调用。单层、蓝图和 `?sensorPoints=0` 都不加载 Points / PointMaterial。 */
export function mountSensorPoints(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optOut = sensorPointsOptOutAtBoot(location.search, navigation?.name ?? '')
  publishSensorPoints({ on: false, mounted: false, state: currentState() })
  window.__twinSetSensorPoints = (on) => {
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
