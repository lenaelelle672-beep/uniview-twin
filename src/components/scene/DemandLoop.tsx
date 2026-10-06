import { AdaptiveDpr } from '@react-three/drei/core/AdaptiveDpr'
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { bindTwinInvalidate, flushTwinInvalidate } from '../../scene/demandInvalidate'
import { stepExplodeMotion } from '../../scene/explode'
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

/**
 * D180 续帧：总览 0/2、单层性能 ≤10 / 均衡 ≤30（告警并入）、运动性能 30、后台 0。
 * 晚于场景 useFrame 读 hold，并把 invalidate 按当前 Hz 限幅（相机飞行/拖动走同一套）。
 * AdaptiveDpr 只在性能档。
 */
export function DemandLoop() {
  const rawInvalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const quality = useTwinStore((state) => state.quality)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const view = useTwinStore((state) => state.view)
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
    rawRef.current()
  }).current

  useLayoutEffect(() => {
    bindTwinInvalidate(() => rawRef.current())
    if (window.__twinFrames == null) window.__twinFrames = 0
    gl.shadowMap.autoUpdate = false
    if (quality !== 'perf') gl.shadowMap.needsUpdate = true
  }, [gl, quality])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    gl.shadowMap.needsUpdate = true
  }, [exploded, gl, quality, selectedFloor, view])

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

  useFrame(({ clock }) => {
    const { exploded: boom, view: liveView, quality: liveQuality } = useTwinStore.getState()
    const { animating } = stepExplodeMotion(boom, liveView, clock.elapsedTime)
    if (animating) {
      if (!explodeHold.current) explodeHold.current = retainFrameChannel('motion')
      if (boom) window.__twinBadges = 0
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
      rawRef.current()
      return
    }
    if (wake.current || hz <= 0) return
    const wait = delay > 0 ? delay : 1000 / hz
    wake.current = window.setTimeout(() => {
      wake.current = 0
      markDueChannels(last.current, liveQuality, performance.now(), liveView)
      if (document.visibilityState !== 'hidden') rawRef.current()
    }, wait)
  }, 100)

  return quality === 'perf' && useTwinStore.getState().qualityPinned ? <AdaptiveDpr /> : null
}

export default DemandLoop
