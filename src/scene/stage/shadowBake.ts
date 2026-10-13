type Phase = 'idle' | 'wait' | 'hold'

/** 锁机 D261 窗是点击到标签出齐后再加 1 秒。出齐后还要过完这 1 秒才烘。 */
export const LABEL_WINDOW_MS = 1000
/** 定时器再让出一截，避免关窗那一帧的起点仍被算进闭区间。 */
const WINDOW_SLACK_MS = 48
const LABEL_FALLBACK_MS = 20_000

function shadowProbeEnabled(): boolean {
  if (typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search)
  return params.get('keepDrawingBuffer') === '1' || params.get('probe') === '1'
}

type LabelMember = {
  scale?: { x?: number }
  fillOpacity?: number
  textRenderInfo?: { blockBounds?: unknown }
}

type SceneLike = { getObjectByName: (name: string) => unknown }

let phase: Phase = 'idle'
let reason = ''
let entryMark = 0
let shownAt: number | null = null
let shownVis = -1
let shownStable = 0
let watchRaf = 0
let windowTimer: ReturnType<typeof setTimeout> | 0 = 0
let fallbackTimer: ReturnType<typeof setTimeout> | 0 = 0
const windowWakes = new Set<() => void>()

function clearLabelTimers() {
  if (windowTimer) {
    clearTimeout(windowTimer)
    windowTimer = 0
  }
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = 0
  }
  if (watchRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(watchRaf)
    watchRaf = 0
  }
}

export function resetShadowBake() {
  phase = 'idle'
  reason = ''
  entryMark = 0
  shownAt = null
  shownVis = -1
  shownStable = 0
  clearLabelTimers()
}

export function shadowBakePending(): boolean {
  return phase !== 'idle'
}

export function labelShownAt(): number | null {
  return shownAt
}

/** 出齐时刻之后再过 LABEL_WINDOW_MS。没有出齐时间则窗还开着。 */
export function labelWindowClosed(now = performance.now()): boolean {
  if (shownAt == null) return false
  return now >= shownAt + LABEL_WINDOW_MS
}

/**
 * 进层时记下时刻。这一刻之前的 ReadyAt / fadeDoneAt 属于上一层，不能拿来关窗。
 */
export function markShadowEntry(now = performance.now()) {
  entryMark = now
  shownAt = null
  shownVis = -1
  shownStable = 0
  clearLabelTimers()
  if (typeof window === 'undefined') return
  const mark = entryMark
  fallbackTimer = setTimeout(() => {
    fallbackTimer = 0
    if (entryMark !== mark || shownAt != null) return
    shownAt = performance.now() - LABEL_WINDOW_MS
    armWindowTimer(shownAt)
  }, LABEL_FALLBACK_MS)
}

/** 窗关上时叫醒需求帧，并让吊顶/圆标挂上。出齐本身不订阅这个回调。 */
export function subscribeLabelWindowOpen(fn: () => void): () => void {
  windowWakes.add(fn)
  return () => {
    windowWakes.delete(fn)
  }
}

function armWindowTimer(shown: number) {
  if (windowTimer) clearTimeout(windowTimer)
  const wait = Math.max(0, shown + LABEL_WINDOW_MS + WINDOW_SLACK_MS - performance.now())
  const mark = entryMark
  windowTimer = setTimeout(() => {
    windowTimer = 0
    if (entryMark !== mark || shownAt == null) return
    if (!labelWindowClosed()) {
      armWindowTimer(shownAt)
      return
    }
    for (const fn of [...windowWakes]) fn()
  }, wait)
}

function labelStampAfterEntry(): boolean {
  if (typeof window === 'undefined') return false
  const phases = window.__twinLabelPhases
  const stamps = [phases?.fadeDoneAt, window.__twinLabelReadyAt, window.__twinLabelPaintAt]
  return stamps.some((value) => typeof value === 'number' && value >= entryMark)
}

/**
 * 与锁机出齐同一判据：成员 scale 与不透明度到位、blockBounds 齐，且连续三帧，淡入中不算。
 * 返回出齐时刻；未到返回 null。
 */
export function observeLabelMembers(
  members: Iterable<LabelMember> | null | undefined,
  fading: boolean,
  now: number,
): number | null {
  if (shownAt != null) return shownAt
  if (fading || !members) {
    shownVis = -1
    shownStable = 0
    return null
  }
  let vis = 0
  let ready = 0
  for (const text of members) {
    if ((text.scale?.x ?? 0) > 0.05 && (text.fillOpacity ?? 0) >= 0.98) {
      vis += 1
      if (text.textRenderInfo?.blockBounds) ready += 1
    }
  }
  if (vis > 0 && vis === ready) {
    if (vis === shownVis) shownStable += 1
    else {
      shownVis = vis
      shownStable = 1
    }
    if (shownStable >= 3) {
      shownAt = now
      return shownAt
    }
    return null
  }
  shownVis = -1
  shownStable = 0
  return null
}

function readLabelMembers(scene: SceneLike): Iterable<LabelMember> | null {
  const batch = scene.getObjectByName('RoomLabelBatchedText') as { _members?: { keys?: () => Iterable<LabelMember> } } | null
  const members = batch?._members
  if (members && typeof members.keys === 'function') return members.keys()
  return null
}

/** 有进层后的标签时间戳才开始看。淡入期间不遍历场景。 */
export function ensureLabelWatch(scene: SceneLike) {
  if (shownAt != null || watchRaf) return
  if (typeof requestAnimationFrame !== 'function') return
  if (!labelStampAfterEntry()) return
  const step = () => {
    watchRaf = 0
    if (shownAt != null) return
    const fading = typeof window !== 'undefined' && window.__twinLabelFading === true
    if (fading) {
      shownVis = -1
      shownStable = 0
      watchRaf = requestAnimationFrame(step)
      return
    }
    const at = observeLabelMembers(readLabelMembers(scene), false, performance.now())
    if (at != null) {
      armWindowTimer(at)
      return
    }
    watchRaf = requestAnimationFrame(step)
  }
  watchRaf = requestAnimationFrame(step)
}

export function noteShadowBakeFrame(info: {
  ready: boolean
  rested: boolean
  interior: boolean
  cutActive: boolean
  clipping: boolean
  windowClosed?: boolean
}) {
  if (typeof window === 'undefined' || !shadowProbeEnabled()) return
  const log = (window.__twinShadowBakeLog ??= [])
  log.push({ at: performance.now(), phase, reason, ...info })
  if (log.length > 8) log.splice(0, log.length - 8)
}

/**
 * 进层一律推迟。单层上只要 D261 窗还开着，剖切、昼夜、爆炸也推迟。
 * 总览上的昼夜和爆炸立即烘。离开单层不走这里。
 */
export function shouldDeferShadowBake(input: {
  reason: 'floor' | 'view' | 'explode' | 'day-night' | 'quality'
  view: string
  rested: boolean
  labelWindowClosed?: boolean
}): boolean {
  if (input.reason === 'floor') return true
  if (input.view === 'floor' && input.labelWindowClosed !== true) return true
  return false
}

export function requestShadowBake(nextReason: string, defer: boolean): 'bake-now' | 'defer' {
  reason = nextReason
  if (!defer) {
    phase = 'idle'
    return 'bake-now'
  }
  phase = 'wait'
  return 'defer'
}

/**
 * 场景和标签窗都就绪后先空过一帧，下一帧才烘。
 * 飞入帧、停稳帧、出齐当帧都不打 needsUpdate。
 */
export function stepShadowBake(ready: boolean): string | null {
  if (phase === 'idle') return null
  if (!ready) {
    phase = 'wait'
    return null
  }
  if (phase === 'wait') {
    phase = 'hold'
    return null
  }
  const baked = reason
  phase = 'idle'
  reason = ''
  return baked
}

export function shadowSceneReady(input: {
  view: string
  rested: boolean
  interiorMounted: boolean
  cutActive: boolean
  clippingEnabled: boolean
  labelWindowClosed?: boolean
}): boolean {
  if (input.view !== 'floor') return true
  if (!input.rested || !input.interiorMounted) return false
  if (input.cutActive !== input.clippingEnabled) return false
  return input.labelWindowClosed === true
}

type ShadowMapHost = {
  shadowMap: { autoUpdate: boolean; needsUpdate: boolean }
}

export function commitShadowBake(
  gl: ShadowMapHost,
  bakeReason: string,
  extra: { rested: boolean; interior: boolean; deferred: boolean },
) {
  gl.shadowMap.autoUpdate = false
  gl.shadowMap.needsUpdate = true
  if (typeof window === 'undefined' || !shadowProbeEnabled()) return
  window.__twinShadowBake = {
    at: performance.now(),
    reason: bakeReason,
    rested: extra.rested,
    interior: extra.interior,
    deferred: extra.deferred,
    labelShownAt: shownAt,
  }
}
