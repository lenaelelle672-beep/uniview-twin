import { createElement, Suspense, type ReactNode } from 'react'
import { podiumCourtDueLatched } from './plan'

/**
 * T134：屋顶绿化与下沉庭院细节开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 细部几何再等同一道 2600ms 窗口才加载。不进 hardGate / balancedFx。
 * 定时器只复查门闩，不调用 invalidate。
 */

type Live = () => ReactNode

let started = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''
let shown = false

function wanted(): boolean {
  due = podiumCourtDueLatched(due, window.__twinFirstFrameAt, performance.now())
  return due
}

function commit(node: ReactNode, on: boolean): boolean {
  window.__twinPodiumCourtNode = node
  const flushed = window.__twinSceneOverlayFlush?.() === true
  if (!flushed) return false
  if (on !== shown) {
    shown = on
    void window.__twinInvalidate?.()
  }
  return true
}

function publish(on: boolean): void {
  window.__twinPodiumCourt = {
    on,
    mounted: on,
    afterFirstMs: 2600,
  }
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./PodiumCourtDetail').then((mod) => {
    live = mod.PodiumCourtDetail
  })
  await loading
}

async function refresh(): Promise<void> {
  const show = wanted()
  const next = show ? 'on' : 'pending'
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

/** dock 晚加载之后调用。窗口未过不请求细部几何。 */
export function mountPodiumCourt(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  publish(false)
  void refresh()
  window.setInterval(() => {
    void refresh()
  }, 200)
}
