import { AdaptiveDpr } from '@react-three/drei/core/AdaptiveDpr'
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { bindTwinInvalidate, flushTwinInvalidate } from '../../scene/demandInvalidate'
import {
  emptyChannelClock,
  holdSnapshot,
  markDueChannels,
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
  const setThree = useThree((state) => state.set)
  const gl = useThree((state) => state.gl)
  const quality = useTwinStore((state) => state.quality)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const view = useTwinStore((state) => state.view)
  const last = useRef(emptyChannelClock())
  const wake = useRef(0)
  const lastGate = useRef(0)
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
    bindTwinInvalidate(gatedInvalidate)
    setThree({ invalidate: gatedInvalidate })
    gl.shadowMap.autoUpdate = false
    if (quality !== 'perf') gl.shadowMap.needsUpdate = true
    return () => {
      setThree({ invalidate: rawInvalidate })
    }
  }, [gatedInvalidate, gl, quality, rawInvalidate, setThree])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    gl.shadowMap.needsUpdate = true
  }, [exploded, gl, quality, selectedFloor, view])

  useEffect(() => {
    const unsubAfter = addAfterEffect(() => flushTwinInvalidate())
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

  useFrame(() => {
    const hidden = document.visibilityState === 'hidden'
    const hz = scheduledHz(quality, view, hidden)
    window.__twinFrameCount = (window.__twinFrameCount ?? 0) + 1
    window.__twinLastFrameAt = performance.now()
    window.__twinGlFrame = gl.info.render.frame
    window.__twinSchedule = { hz, view, quality, hidden, holds: holdSnapshot() }
    if (hidden) return
    const now = performance.now()
    const delay = soonestWakeMs(last.current, quality, now, false, view)
    if (!Number.isFinite(delay)) return
    if (delay === 0) {
      markDueChannels(last.current, quality, now, view)
      gatedInvalidate()
      return
    }
    if (wake.current) return
    wake.current = window.setTimeout(() => {
      wake.current = 0
      if (document.visibilityState !== 'hidden') gatedInvalidate()
    }, delay)
  }, 100)

  return quality === 'perf' ? <AdaptiveDpr /> : null
}
