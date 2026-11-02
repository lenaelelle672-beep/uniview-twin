import { createElement, Suspense, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  KENNEY_CHAIR_URL,
  KENNEY_DESK_URL,
  KENNEY_SEED_CAP,
  kenneyFurnitureVisible,
  type KenneyGateInput,
} from './plan'

/**
 * T102：Kenney 桌椅开关。
 * dock 在首帧之后才 import 本文件。生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 画面组件再等单层、且不在爆炸 / 工位拆解时才加载，不进 hardGate / balancedFx。
 */

type Live = () => ReactNode

let started = false
let live: Live | null = null
let loading: Promise<void> | null = null
let token = 0
let signature = ''

function gate(): KenneyGateInput {
  const state = useTwinStore.getState()
  const station = window.__twinStationExplode
  return {
    view: state.view,
    floorId: state.selectedFloor,
    exploded: state.exploded,
    explodeProgress: state.explodeProgress ?? window.__twinExplode?.progress ?? 0,
    stationProgress: station?.progress ?? 0,
    stationActive: station?.active === true,
    stationAnimating: station?.animating === true,
  }
}

function publish(on: boolean, floorId: string | null): void {
  const prev = window.__twinKenney
  window.__twinKenney = {
    on,
    mounted: on ? prev?.mounted === true : false,
    floorId: on ? floorId : null,
    desks: on ? prev?.desks ?? 0 : 0,
    chairs: on ? prev?.chairs ?? 0 : 0,
    cap: KENNEY_SEED_CAP,
    deskUrl: KENNEY_DESK_URL,
    chairUrl: KENNEY_CHAIR_URL,
    impl: 'drei-useGLTF',
  }
}

function commit(node: ReactNode): boolean {
  window.__twinKenneyNode = node
  const flushed = window.__twinSceneOverlayFlush?.() === true
  if (flushed) void window.__twinInvalidate?.()
  return flushed
}

async function loadLive(): Promise<void> {
  if (live) return
  loading ??= import('./KenneyStations').then((mod) => {
    live = mod.KenneyStations
  })
  await loading
}

async function refresh(): Promise<void> {
  const input = gate()
  const visible = kenneyFurnitureVisible(input)
  const next = visible ? `1|${input.floorId ?? ''}` : '0'
  if (next === signature) return
  signature = next
  const mine = ++token
  if (!visible || !input.floorId) {
    commit(null)
    publish(false, null)
    return
  }
  await loadLive()
  if (mine !== token || !live || !kenneyFurnitureVisible(gate())) {
    if (mine === token) {
      signature = ''
      commit(null)
      publish(false, null)
    }
    return
  }
  const placed = commit(createElement(Suspense, { fallback: null }, createElement(live)))
  publish(true, gate().floorId)
  // 格网槽还没包上测距挂载点时，下一拍再送一次，避免签名定死后节点永远进不了画布。
  if (!placed) signature = ''
}

/** dock 晚加载之后调用。总览不请求 GLB。 */
export function mountKenneyFurniture(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  publish(false, null)
  void refresh()
  useTwinStore.subscribe(() => {
    void refresh()
  })
  window.setInterval(() => {
    void refresh()
  }, 100)
}
