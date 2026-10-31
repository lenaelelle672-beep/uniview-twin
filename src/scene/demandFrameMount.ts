/**
 * T097：把楼层爆炸进度和工位徽标矩阵接到共用 askFrame。
 * 生产构建在 DemandLoop 哈希定稿后才加载本文件，不进 hardGate / balancedFx。
 * 不引用 three、zustand、FixedFramePump。采样窗仍由 AdaptiveQuality 自己停。
 */

import {
  askFrame,
  bindDemandFrame,
  demandFrameReady,
  demandFrameSnapshot,
  demandInvalidate,
  guardDemandInvalidate,
  holdDemandFrame,
  markStationDemandMotion,
  resumeDemandFrame,
} from './demandFrame'

/** 进度停住这么久还没落到目标，就不再续帧。短于爆炸 0.8 秒，避免空转。 */
export const DEMAND_STALL_MS = 400

const PROGRESS_EPS = 1e-3

export interface StallClock {
  previous: number | null
  movedAt: number
}

export interface SyncMemory {
  slider: StallClock
  badge: StallClock
  wasSlider: boolean
  wasBadge: boolean
}

export function emptySyncMemory(): SyncMemory {
  return {
    slider: { previous: null, movedAt: -1 },
    badge: { previous: null, movedAt: -1 },
    wasSlider: false,
    wasBadge: false,
  }
}

/** 离开总览就不跟楼层外壳进度。null 表示这一帧不要滑杆续帧。 */
export function explodeTarget(view: string | undefined, explodedAttr: string | null): number | null {
  if (view != null && view !== 'building') return null
  return explodedAttr === 'true' ? 1 : 0
}

export function progressNeedsFrame(
  clock: StallClock,
  progress: number | undefined,
  target: number,
  now: number,
): { moving: boolean; clock: StallClock } {
  if (progress == null || !Number.isFinite(progress) || Math.abs(progress - target) <= PROGRESS_EPS) {
    return {
      moving: false,
      clock: { previous: progress != null && Number.isFinite(progress) ? progress : clock.previous, movedAt: clock.movedAt },
    }
  }
  if (clock.previous == null || progress !== clock.previous) {
    return { moving: true, clock: { previous: progress, movedAt: now } }
  }
  return {
    moving: clock.movedAt >= 0 && now - clock.movedAt < DEMAND_STALL_MS,
    clock,
  }
}

export function badgeNeedsFrame(
  clock: StallClock,
  animating: boolean,
  progress: number | undefined,
  now: number,
): { moving: boolean; clock: StallClock } {
  if (!animating) {
    return {
      moving: false,
      clock: {
        previous: progress != null && Number.isFinite(progress) ? progress : clock.previous,
        movedAt: clock.movedAt,
      },
    }
  }
  if (progress == null || !Number.isFinite(progress)) {
    const movedAt = clock.movedAt >= 0 ? clock.movedAt : now
    return { moving: now - movedAt < DEMAND_STALL_MS, clock: { previous: clock.previous, movedAt } }
  }
  if (clock.previous == null || progress !== clock.previous) {
    return { moving: true, clock: { previous: progress, movedAt: now } }
  }
  return {
    moving: clock.movedAt >= 0 && now - clock.movedAt < DEMAND_STALL_MS,
    clock,
  }
}

export function syncDemandSources(
  input: {
    now: number
    view: string | undefined
    explodedAttr: string | null
    explodeProgress: number | undefined
    badgeAnimating: boolean
    badgeProgress: number | undefined
  },
  memory: SyncMemory,
): { askSlider: boolean; askBadge: boolean; memory: SyncMemory } {
  const target = explodeTarget(input.view, input.explodedAttr)
  const sliderStep =
    target == null
      ? { moving: false, clock: memory.slider }
      : progressNeedsFrame(memory.slider, input.explodeProgress, target, input.now)
  const badgeStep = badgeNeedsFrame(memory.badge, input.badgeAnimating, input.badgeProgress, input.now)
  return {
    askSlider: sliderStep.moving || memory.wasSlider,
    askBadge: badgeStep.moving || memory.wasBadge,
    memory: {
      slider: sliderStep.clock,
      badge: badgeStep.clock,
      wasSlider: sliderStep.moving,
      wasBadge: badgeStep.moving,
    },
  }
}

interface FrameState {
  invalidate: () => void
  internal?: {
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

let started = false
let memory = emptySyncMemory()

function publish(): void {
  window.__twinDemandFrame = {
    askFrame,
    demandInvalidate,
    hold: holdDemandFrame,
    ready: demandFrameReady,
    status: demandFrameSnapshot,
  }
}

function onFrame(): void {
  if (window.__twinStationExplode?.animating === true) markStationDemandMotion()
  const stage = document.querySelector('main.stage')
  const decision = syncDemandSources(
    {
      now: performance.now(),
      view: window.__twinView,
      explodedAttr: stage?.getAttribute('data-exploded') ?? null,
      explodeProgress: window.__twinExplode?.progress,
      badgeAnimating: window.__twinStationExplode?.animating === true,
      badgeProgress: window.__twinStationExplode?.progress,
    },
    memory,
  )
  memory = decision.memory
  if (decision.askSlider) askFrame('slider')
  if (decision.askBadge) askFrame('badge')
}

function attach(): void {
  const root = frameRoot()
  if (!root) {
    window.setTimeout(attach, 240)
    return
  }
  bindDemandFrame(() => {
    const demand = window.__twinInvalidate
    if (typeof demand === 'function') {
      void demand()
      return
    }
    root.state.invalidate()
  })
  // 人物/告警 Hz 走的是 store 上当前的 invalidate。停稳后从这里丢掉自续。
  root.state.invalidate = guardDemandInvalidate(root.state.invalidate)
  const ref = { current: onFrame }
  root.state.internal?.subscribe?.(ref, 0, root.store)
}

/** DemandLoop 加载后调用。重复调用直接返回。 */
export function mountDemandFrame(): void {
  if (started || typeof window === 'undefined') return
  started = true
  publish()
  document.addEventListener('visibilitychange', () => {
    resumeDemandFrame()
  })
  attach()
}
