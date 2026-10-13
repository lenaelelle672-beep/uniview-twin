import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { bindTwinInvalidate, flushTwinInvalidate } from '../../scene/demandInvalidate'
import { stepExplodeMotion } from '../../scene/explode'
import { isCameraRested } from '../../scene/stage/cameraRest'
import { cutElevation } from '../../scene/stage/cut'
import {
  commitShadowBake,
  ensureLabelWatch,
  labelWindowClosed,
  markShadowEntry,
  noteShadowBakeFrame,
  requestShadowBake,
  shadowBakePending,
  shadowSceneReady,
  shouldDeferShadowBake,
  stepShadowBake,
  subscribeLabelWindowOpen,
} from '../../scene/stage/shadowBake'
import {
  bumpTwinFrames,
  emptyChannelClock,
  holdSnapshot,
  markDueChannels,
  retainFrameChannel,
  scheduledHz,
  soonestWakeMs,
} from '../../scene/frameSchedule'
import { useTwinStore } from '../../store/store'

function markInv(src: string) {
  if (!import.meta.env.DEV) return
  const counts = (window.__twinInvalidateCounts ??= {})
  counts[src] = (counts[src] ?? 0) + 1
  const log = (window.__twinInvalidateLog ??= [])
  log.push({ t: performance.now(), src })
  if (log.length > 400) log.splice(0, log.length - 400)
}

/**
 * D180 续帧：总览 0/2、单层性能 ≤10 / 均衡 ≤30（告警并入）、运动性能 30、后台 0。
 * 晚于场景 useFrame 读 hold，并把 invalidate 按当前 Hz 限幅（相机飞行/拖动走同一套）。
 */
export function DemandLoop() {
  const rawInvalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const quality = useTwinStore((state) => state.quality)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const view = useTwinStore((state) => state.view)
  const dayNight = useTwinStore((state) => state.dayNight)
  const presentation = useTwinStore((state) => state.presentation)
  const controls = useThree((state) => state.controls)
  const last = useRef(emptyChannelClock())
  const wake = useRef(0)
  const lastGate = useRef(0)
  const explodeHold = useRef<(() => void) | null>(null)
  const rawRef = useRef(rawInvalidate)
  rawRef.current = rawInvalidate

  const gatedInvalidate = useRef(() => {
    if (document.visibilityState === 'hidden') return
    const { quality: q, view: v } = useTwinStore.getState()
    const hz = scheduledHz(q, v, false)
    if (Number.isFinite(hz) && hz > 0) {
      const now = performance.now()
      if (now - lastGate.current < 1000 / hz - 1) return
      lastGate.current = now
    }
    if (import.meta.env.DEV) markInv('demand-store')
    rawRef.current()
  }).current

  useLayoutEffect(() => {
    bindTwinInvalidate(() => rawRef.current())
    if (window.__twinFrames == null) window.__twinFrames = 0
    gl.shadowMap.autoUpdate = false
    if (quality === 'perf') {
      requestShadowBake('quality-off', false)
      return
    }
    const live = useTwinStore.getState()
    const defer = shouldDeferShadowBake({
      reason: 'quality',
      view: live.view,
      rested: isCameraRested(),
      labelWindowClosed: live.view !== 'floor' || labelWindowClosed(),
    })
    if (requestShadowBake('quality', defer) === 'bake-now') {
      commitShadowBake(gl, 'quality', { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [gl, quality])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    const live = useTwinStore.getState()
    const defer = shouldDeferShadowBake({
      reason: 'explode',
      view: live.view,
      rested: isCameraRested(),
      labelWindowClosed: live.view !== 'floor' || labelWindowClosed(),
    })
    if (requestShadowBake(exploded ? 'explode' : 'collapse', defer) === 'bake-now') {
      commitShadowBake(gl, exploded ? 'explode' : 'collapse', { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [exploded, gl, quality])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    const live = useTwinStore.getState()
    const defer = shouldDeferShadowBake({
      reason: 'day-night',
      view: live.view,
      rested: isCameraRested(),
      labelWindowClosed: live.view !== 'floor' || labelWindowClosed(),
    })
    const bakeReason = `surface:${presentation}:${dayNight}`
    if (requestShadowBake(bakeReason, defer) === 'bake-now') {
      commitShadowBake(gl, bakeReason, { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [dayNight, gl, presentation, quality])

  // 放在最后：同一提交里昼夜/爆炸若先打了 needsUpdate，进层要清掉，飞入帧不烘。
  // 不依赖 quality，避免换档时把已经该烘的影子清掉。
  // 性能档也要记下进层时刻，否则上一层的出齐时间会把吊顶提前挂回来。
  useLayoutEffect(() => {
    if (view === 'floor') {
      markShadowEntry()
      if (useTwinStore.getState().quality === 'perf') return
      requestShadowBake(`floor:${selectedFloor ?? ''}`, true)
      gl.shadowMap.needsUpdate = false
      gl.shadowMap.autoUpdate = false
      return
    }
    if (useTwinStore.getState().quality === 'perf') return
    if (requestShadowBake(`view:${view}`, false) === 'bake-now') {
      commitShadowBake(gl, `view:${view}`, { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [gl, selectedFloor, view])

  useEffect(() => subscribeLabelWindowOpen(() => rawRef.current()), [])

  useEffect(() => {
    const rig = controls as { addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void } | null
    if (!rig?.addEventListener || !rig.removeEventListener) return undefined
    const add = rig.addEventListener.bind(rig)
    const remove = rig.removeEventListener.bind(rig)
    let release: (() => void) | null = null
    const hold = () => {
      if (!release) release = retainFrameChannel('motion')
    }
    const drop = () => {
      release?.()
      release = null
    }
    add('wake', hold)
    add('sleep', drop)
    return () => {
      remove('wake', hold)
      remove('sleep', drop)
      drop()
    }
  }, [controls])

  useEffect(() => {
    const unsubAfter = addAfterEffect(() => {
      bumpTwinFrames()
      flushTwinInvalidate()
    })
    const unsubStore = useTwinStore.subscribe(() => {
      if (document.visibilityState === 'hidden') return
      gatedInvalidate()
    })
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (wake.current) {
          window.clearTimeout(wake.current)
          wake.current = 0
        }
        return
      }
      gatedInvalidate()
    }
    document.addEventListener('visibilitychange', onVis)
    gatedInvalidate()
    return () => {
      unsubAfter()
      unsubStore()
      document.removeEventListener('visibilitychange', onVis)
      if (wake.current) window.clearTimeout(wake.current)
    }
  }, [gatedInvalidate])

  useFrame(({ clock, scene }) => {
    const { exploded: boom, view: liveView, quality: liveQuality, selectedFloor: liveFloor } = useTwinStore.getState()
    if (liveView === 'floor') ensureLabelWatch(scene)
    if (liveQuality !== 'perf' && document.visibilityState !== 'hidden' && shadowBakePending()) {
      const cutActive = cutElevation(liveView, liveFloor) != null
      const interiorMounted = liveView !== 'floor' || scene.getObjectByName('FloorInterior') != null
      const windowClosed = liveView !== 'floor' || labelWindowClosed()
      const ready = shadowSceneReady({
        view: liveView,
        rested: isCameraRested(),
        interiorMounted,
        cutActive,
        clippingEnabled: gl.localClippingEnabled,
        labelWindowClosed: windowClosed,
      })
      noteShadowBakeFrame({
        ready,
        rested: isCameraRested(),
        interior: interiorMounted,
        cutActive,
        clipping: gl.localClippingEnabled,
        windowClosed,
      })
      const baked = stepShadowBake(ready)
      if (baked) {
        commitShadowBake(gl, baked, { rested: isCameraRested(), interior: interiorMounted, deferred: true })
      } else if (ready) {
        // 单层没有人物/告警时调度是 0Hz。窗关上的 hold 帧再要一帧，阴影 pass 才落在窗后。
        rawRef.current()
      }
    }
    const { animating } = stepExplodeMotion(boom, liveView, clock.elapsedTime)
    if (animating) {
      if (!explodeHold.current) explodeHold.current = retainFrameChannel('motion')
    } else if (explodeHold.current) {
      explodeHold.current()
      explodeHold.current = null
    }
    const hidden = document.visibilityState === 'hidden'
    const hz = scheduledHz(liveQuality, liveView, hidden)
    window.__twinFrameCount = window.__twinFrames ?? 0
    window.__twinLastFrameAt = performance.now()
    window.__twinGlFrame = gl.info.render.frame
    window.__twinSchedule = { hz, view: liveView, quality: liveQuality, hidden, holds: holdSnapshot() }
    if (hidden) return
    const now = performance.now()
    const delay = soonestWakeMs(last.current, liveQuality, now, false, liveView)
    if (!Number.isFinite(delay)) return
    if (delay === 0 && hz === Number.POSITIVE_INFINITY) {
      markDueChannels(last.current, liveQuality, now, liveView)
      if (import.meta.env.DEV) markInv('demand-unlimited')
      rawRef.current()
      return
    }
    if (wake.current || hz <= 0) return
    const wait = delay > 0 ? delay : 1000 / hz
    wake.current = window.setTimeout(() => {
      wake.current = 0
      markDueChannels(last.current, liveQuality, performance.now(), liveView)
      if (document.visibilityState !== 'hidden') {
        if (import.meta.env.DEV) markInv(`demand-hz-${hz}`)
        rawRef.current()
      }
    }, wait)
  }, 100)

  return null
}

export default DemandLoop
