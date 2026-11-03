import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  LOCAL_CLOUD_TEXTURE,
  OVERVIEW_CLOUD_GROWTH,
  OVERVIEW_CLOUD_LIMIT,
  OVERVIEW_CLOUD_SPEED,
  OVERVIEW_CLOUDS,
  overviewCloudsChunkDue,
  overviewCloudsVisible,
  type OverviewCloudGate,
} from './plan'

/**
 * T106：云层开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * drei Cloud 再等总览昼景、并且过了同一道 2600ms 窗口才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不调用 invalidate。
 */

type Live = () => ReactNode

let started = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function readGate(): OverviewCloudGate {
  const state = useTwinStore.getState()
  return {
    view: state.view,
    dayNight: state.dayNight,
    presentation: state.presentation,
  }
}

function wanted(): boolean {
  return overviewCloudsChunkDue(window.__twinFirstFrameAt, performance.now()) && overviewCloudsVisible(readGate())
}

function publish(on: boolean): void {
  const prev = window.__twinOverviewClouds
  window.__twinOverviewClouds = {
    on,
    mounted: on ? prev?.mounted === true : false,
    texture: LOCAL_CLOUD_TEXTURE,
    speed: OVERVIEW_CLOUD_SPEED,
    growth: OVERVIEW_CLOUD_GROWTH,
    limit: OVERVIEW_CLOUD_LIMIT,
    count: OVERVIEW_CLOUDS.length,
    segments: OVERVIEW_CLOUD_LIMIT,
    impl: 'drei-cloud',
    cdn: false,
  }
}

function commit(node: ReactNode, on: boolean): boolean {
  window.__twinOverviewCloudNode = node
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
  loading ??= import('./OverviewClouds').then((mod) => {
    live = mod.OverviewClouds
  })
  await loading
}

async function refresh(): Promise<void> {
  const show = wanted()
  const next = show ? 'on' : 'off'
  if (next === signature) return
  const mine = ++token
  signature = next
  if (!show) {
    const placed = commit(null, false)
    publish(false)
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
  publish(true)
}

/** dock 晚加载之后调用。夜景、白模、单层都不请求云贴图。 */
export function mountOverviewClouds(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  publish(false)
  void refresh()
  useTwinStore.subscribe(() => {
    void refresh()
  })
  window.setInterval(() => {
    void refresh()
  }, 200)
}
