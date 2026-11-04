import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import { discardProxyDue, discardProxyWanted } from './plan'
import { publishDiscardProxy } from './probe'

/**
 * T115：拾取代理开关。
 * dock 在首帧之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉接线，
 * 定稿后再把独立分包接回去。MeshDiscardMaterial 再等进层、并且过了 2600ms 才加载。
 * 不进 hardGate / balancedFx。定时器只复查门闩，不续帧。
 */

type Live = () => ReactNode

let started = false
let due = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''

function searchNow(): string {
  return typeof location === 'undefined' ? '' : location.search
}

function wanted(): boolean {
  due = discardProxyDue(due, window.__twinFirstFrameAt, performance.now())
  if (!due) return false
  return discardProxyWanted(useTwinStore.getState().view, searchNow())
}

function commit(node: ReactNode): boolean {
  window.__twinDiscardProxyNode = node
  return window.__twinSceneOverlayFlush?.() === true
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./DiscardProxy').then((mod) => {
    live = mod.DiscardProxy
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
    const placed = commit(null)
    publishDiscardProxy(false, false, 0)
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
  const placed = commit(createElement(Suspense, { fallback: null }, createElement(live)))
  if (!placed) {
    if (mine === token) signature = ''
    return
  }
  publishDiscardProxy(true, window.__twinDiscardProxy?.mounted === true, window.__twinDiscardProxy?.count ?? 0)
}

/** dock 晚加载之后调用。总览不加载 MeshDiscardMaterial。 */
export function mountDiscardProxy(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  publishDiscardProxy(false, false, 0)
  void refresh()
  useTwinStore.subscribe(() => {
    void refresh()
  })
  window.setInterval(() => {
    void refresh()
  }, 200)
}
