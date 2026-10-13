type Phase = 'idle' | 'wait' | 'hold'

function shadowProbeEnabled(): boolean {
  if (typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search.startsWith('?') ? location.search.slice(1) : location.search)
  return params.get('keepDrawingBuffer') === '1' || params.get('probe') === '1'
}

let phase: Phase = 'idle'
let reason = ''

export function resetShadowBake() {
  phase = 'idle'
  reason = ''
}

export function shadowBakePending(): boolean {
  return phase !== 'idle'
}

export function noteShadowBakeFrame(info: {
  ready: boolean
  rested: boolean
  interior: boolean
  cutActive: boolean
  clipping: boolean
}) {
  if (typeof window === 'undefined' || !shadowProbeEnabled()) return
  const log = (window.__twinShadowBakeLog ??= [])
  log.push({ at: performance.now(), phase, reason, ...info })
  if (log.length > 8) log.splice(0, log.length - 8)
}

/**
 * 进层一律推迟。飞入中（单层且未停稳）的剖切、昼夜、爆炸也推迟。
 * 总览上的昼夜和爆炸立即烘。
 */
export function shouldDeferShadowBake(input: {
  reason: 'floor' | 'view' | 'explode' | 'day-night' | 'quality'
  view: string
  rested: boolean
}): boolean {
  if (input.reason === 'floor') return true
  if (input.view === 'floor' && !input.rested) return true
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
 * 室内和 FloorCut 都就绪后先空过一帧，下一帧才烘。
 * 进层那一帧往往已经停稳（setLookAt 在绘制前就 resolve），不能在当帧打 needsUpdate。
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
}): boolean {
  if (input.view !== 'floor') return true
  if (!input.rested || !input.interiorMounted) return false
  return input.cutActive === input.clippingEnabled
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
  }
}
