import { createRevealDriver, type RevealFrameState } from './driver'
import type { RangeMesh } from './plan'

/**
 * T112：进层时室内楼板和合并核心筒按 setDrawRange 渐进显形。
 * dock 在首帧之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉接线，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 不新开渲染循环：挂在 R3F 自己的帧回调上，只在显形那几百毫秒里 invalidate。
 */

let started = false

interface FrameState extends RevealFrameState {
  internal?: RevealFrameState['internal'] & {
    subscribe?: (
      ref: { current: (state: FrameState, delta: number) => void },
      priority?: number,
      store?: FrameStore,
    ) => () => void
  }
}

interface FrameStore {
  getState: () => FrameState
}

function frameRoot(): { state: FrameState; store: FrameStore } | null {
  const scene = window.__twinScene as { __r3f?: { root?: FrameStore } } | undefined
  const store = scene?.__r3f?.root
  if (!store) return null
  const state = store.getState()
  if (typeof state?.invalidate !== 'function' || typeof state.internal?.subscribe !== 'function') return null
  return { state, store }
}

/** AssetLoadOverlay 的门闩。加载条还在，就当这次进层没有显形。 */
function overlayUp(): boolean {
  return document.querySelector('[data-twin-asset-load]') != null
}

function nightScene(): boolean {
  return document.querySelector('.scene-root')?.getAttribute('data-day-night') === 'night'
}

function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function stationBusy(): boolean {
  const explode = window.__twinStationExplode
  return explode?.active === true || explode?.animating === true
}

function attach(onFrame: (state: FrameState) => void): void {
  const root = frameRoot()
  if (!root) {
    window.setTimeout(() => attach(onFrame), 240)
    return
  }
  // priority 0。正优先级会关掉 R3F 自己的渲染。第三个参数必须是 store。
  root.state.internal?.subscribe?.({ current: onFrame }, 0, root.store)
}

export function mountDrawRangeReveal(): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return
  started = true
  const driver = createRevealDriver({
    now: () => performance.now(),
    view: () => window.__twinView,
    scene: () => window.__twinScene as unknown as RangeMesh | undefined,
    overlay: overlayUp,
    night: nightScene,
    reducedMotion,
    hidden: () => document.hidden === true,
    stationBusy,
    floorId: () => window.__twinInterior?.floorId ?? null,
    setTimer: (run, ms) => window.setTimeout(run, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
    kick: () => {
      void window.__twinInvalidate?.()
    },
    publish: (stats) => {
      window.__twinDrawRangeReveal = stats
    },
  })
  window.__twinDrawRangeReveal = driver.stats()
  attach(driver.onFrame)
}
