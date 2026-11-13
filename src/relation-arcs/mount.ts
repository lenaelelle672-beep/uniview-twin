import { createElement, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import { relationArcOnAtBoot, relationArcState, type RelationArcGate, type RelationArcState } from './plan'
import { publishRelationArcs } from './probe'

/**
 * T125：设备-告警关系弧开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei CubicBezierLine / QuadraticBezierLine 再等 `?relationArc=1` 且人在单层休息姿态才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不生成点，也不调用 invalidate。
 */

type Live = () => ReactNode

let started = false
let switchOn = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readGate(): RelationArcGate {
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
    switchOn,
    exploded: state.exploded === true || explode?.exploded === true,
    explodeProgress: progress,
    stationActive: station?.active === true,
    stationAnimating: station?.animating === true,
    stationProgress: typeof station?.progress === 'number' ? station.progress : 0,
  }
}

function commit(node: ReactNode, show: boolean): boolean {
  window.__twinRelationArcNode = node
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
  loading ??= import('./RelationArcs').then((mod) => {
    live = mod.RelationArcs
  })
  await loading
}

function publishOff(state: RelationArcState, floorId: string | null): void {
  publishRelationArcs({
    switchOn,
    on: false,
    mounted: false,
    state,
    floorId,
    count: 0,
    quadratic: 0,
    cubic: 0,
  })
}

async function refresh(): Promise<void> {
  const gate = readGate()
  const state = relationArcState(gate)
  const next = state === 'on' ? `on:${gate.floorId ?? ''}` : state
  if (next === signature) return
  const mine = ++token
  signature = next
  if (state !== 'on' || !gate.floorId) {
    const placed = commit(null, false)
    publishOff(state, null)
    if (!placed && mine === token) signature = ''
    return
  }
  try {
    await loadLive()
  } catch {
    if (mine === token) signature = ''
    return
  }
  if (mine !== token || !live || relationArcState(readGate()) !== 'on') {
    if (mine === token) signature = ''
    return
  }
  const placed = commit(createElement(live), true)
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  const floorId = readGate().floorId
  publishRelationArcs({
    switchOn: true,
    on: true,
    mounted: window.__twinRelationArcs?.mounted === true,
    state: 'on',
    floorId,
    count: window.__twinRelationArcs?.count ?? 0,
    quadratic: window.__twinRelationArcs?.quadratic ?? 0,
    cubic: window.__twinRelationArcs?.cubic ?? 0,
  })
}

/** dock 晚加载之后调用。默认关，不请求贝塞尔分包。`?relationArc=1` 才打开。 */
export function mountRelationArcs(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (started) return
  started = true
  const navigation = typeof performance === 'undefined' ? undefined : performance.getEntriesByType('navigation')[0]
  switchOn = relationArcOnAtBoot(location.search, navigation?.name ?? '')
  const state: RelationArcState = relationArcState(readGate())
  publishOff(state, null)
  window.__twinSetRelationArcs = (on) => {
    switchOn = on
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
