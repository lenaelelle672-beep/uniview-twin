import { createElement, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  cableTrayOptOutAtBoot,
  cableTrayState,
  type CableTrayGate,
  type CableTrayState,
} from './plan'
import { publishCableTray } from './probe'

/**
 * T126：桥架开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei shapes 里的 Tube 再等地上单层休息姿态才加载，不进 hardGate / balancedFx。
 * 定时器只复查门闩，不调用 invalidate。
 */

type Live = (props: { floorId: string }) => ReactNode

let started = false
let optOut = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readGate(): CableTrayGate {
  const state = useTwinStore.getState()
  const station = window.__twinStationExplode
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
    optOut,
    exploded: state.exploded === true || explode?.exploded === true,
    explodeProgress: progress,
    stationActive: station?.active === true,
    stationAnimating: station?.animating === true,
    stationProgress: typeof station?.progress === 'number' ? station.progress : 0,
  }
}

function commit(node: ReactNode, show: boolean): boolean {
  window.__twinCableTrayNode = node
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
  loading ??= import('./CableTrays').then((mod) => {
    live = mod.CableTrays
  })
  await loading
}

async function refresh(): Promise<void> {
  const gate = readGate()
  const state = cableTrayState(gate)
  const next = state === 'on' ? `on:${gate.floorId ?? ''}` : state
  if (next === signature) return
  const mine = ++token
  signature = next
  if (state !== 'on' || !gate.floorId) {
    const placed = commit(null, false)
    publishCableTray({ on: false, mounted: false, state, floorId: null, count: 0 })
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live || cableTrayState(readGate()) !== 'on') {
    if (mine === token) signature = ''
    return
  }
  const floorId = readGate().floorId
  if (!floorId) {
    if (mine === token) signature = ''
    return
  }
  const placed = commit(createElement(live, { floorId }), true)
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  publishCableTray({
    on: true,
    mounted: window.__twinCableTray?.mounted === true,
    state: 'on',
    floorId,
    count: window.__twinCableTray?.count ?? 0,
  })
}

/** dock 晚加载之后调用。总览不请求 shapes。`?cableTray=0` 整段不加载。 */
export function mountCableTray(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  optOut = cableTrayOptOutAtBoot(location.search, navigation?.name ?? '')
  const state: CableTrayState = cableTrayState(readGate())
  publishCableTray({ on: false, mounted: false, state, floorId: null, count: 0 })
  window.__twinSetCableTray = (on) => {
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
