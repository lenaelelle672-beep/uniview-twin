import { createElement, type ReactNode } from 'react'
import { floorSpec, isFloorId } from '../data/floors'
import { useTwinStore } from '../store/store'
import {
  boxEnvOptOutAtBoot,
  boxEnvState,
  type BoxEnvGate,
  type BoxEnvState,
} from './plan'
import { publishBoxEnv } from './probe'

/**
 * T127：室内盒投影开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * useBoxProjectedEnv 再等进入单层房间才加载，不进 hardGate / balancedFx。
 * 定时器只复查门闩，不调用 invalidate。
 */

type Live = (props: { floorId: string; elevation: number; height: number }) => ReactNode

let started = false
let optOut = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readGate(): BoxEnvGate {
  const state = useTwinStore.getState()
  const explode = window.__twinExplode
  const motion = window.__twinReadExplodeMotion?.()
  const storeProgress = state.explodeProgress
  const progress =
    typeof motion?.progress === 'number'
      ? motion.progress
      : typeof explode?.progress === 'number'
        ? explode.progress
        : typeof storeProgress === 'number'
          ? storeProgress
          : 0
  return {
    view: state.view,
    floorId: state.selectedFloor,
    presentation: state.presentation,
    optOut,
    exploded: state.exploded === true || explode?.exploded === true,
    explodeProgress: progress,
  }
}

function commit(node: ReactNode, show: boolean, gate: BoxEnvGate, state: BoxEnvState): boolean {
  if (!show) {
    publishBoxEnv({ on: false, mounted: false, state, floorId: null })
  }
  window.__twinBoxProjectedEnvNode = node
  const flushed = window.__twinSceneOverlayFlush?.() === true
  if (!flushed) return false
  if (show !== shown) {
    shown = show
    void window.__twinInvalidate?.()
  }
  if (show) {
    const prev = window.__twinBoxProjectedEnv
    const box =
      prev?.position && prev.size ? { position: prev.position, size: prev.size } : null
    publishBoxEnv({
      on: true,
      mounted: prev?.mounted === true,
      state: 'on',
      floorId: gate.floorId,
      hdr: prev?.hdr ?? null,
      box,
      materials: prev?.materials ?? 0,
    })
  }
  return true
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./IndoorBoxEnv').then((mod) => {
    live = mod.IndoorBoxEnv
  })
  await loading
}

async function refresh(): Promise<void> {
  const gate = readGate()
  const state = boxEnvState(gate)
  const floorId = gate.floorId && isFloorId(gate.floorId) ? gate.floorId : null
  const next = state === 'on' && floorId ? `on:${floorId}` : state
  if (next === signature) return
  const mine = ++token
  signature = next
  if (state !== 'on' || !floorId) {
    const placed = commit(null, false, gate, state === 'on' ? 'off-view' : state)
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  const again = readGate()
  const againId = again.floorId && isFloorId(again.floorId) ? again.floorId : null
  if (mine !== token || !live || boxEnvState(again) !== 'on' || againId !== floorId) {
    if (mine === token) signature = ''
    return
  }
  const spec = floorSpec(floorId)
  const placed = commit(
    createElement(live, { key: floorId, floorId, elevation: spec.elevation, height: spec.height }),
    true,
    again,
    'on',
  )
  if (!placed && mine === token) signature = ''
}

/** dock 晚加载之后调用。总览不请求 useBoxProjectedEnv。`?boxProjectedEnv=0` 整段不加载。 */
export function mountBoxProjectedEnv(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optOut = boxEnvOptOutAtBoot(location.search, navigation?.name ?? '')
  const gate = readGate()
  const state: BoxEnvState = boxEnvState(gate)
  publishBoxEnv({ on: false, mounted: false, state, floorId: null })
  window.__twinSetBoxProjectedEnv = (on) => {
    optOut = !on
    signature = ''
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
