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
 * D179 续帧：总览 0/2、单层性能 10（告警并入）、交互动画性能 30、后台 0。
 * AdaptiveDpr 只在性能档。
 */
export function DemandLoop() {
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const quality = useTwinStore((state) => state.quality)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const view = useTwinStore((state) => state.view)
  const last = useRef(emptyChannelClock())
  const wake = useRef(0)

  useLayoutEffect(() => {
    bindTwinInvalidate(invalidate)
    gl.shadowMap.autoUpdate = false
    if (quality !== 'perf') gl.shadowMap.needsUpdate = true
  }, [gl, invalidate, quality])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    gl.shadowMap.needsUpdate = true
  }, [exploded, gl, quality, selectedFloor, view])

  useEffect(() => {
    const unsubAfter = addAfterEffect(() => flushTwinInvalidate())
    const unsubStore = useTwinStore.subscribe(() => {
      if (document.visibilityState === 'hidden') return
      invalidate()
    })
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        if (wake.current) {
          window.clearTimeout(wake.current)
          wake.current = 0
        }
        return
      }
      invalidate()
    }
    document.addEventListener('visibilitychange', onVis)
    invalidate()
    return () => {
      unsubAfter()
      unsubStore()
      document.removeEventListener('visibilitychange', onVis)
      if (wake.current) window.clearTimeout(wake.current)
    }
  }, [invalidate])

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
      invalidate()
      return
    }
    if (wake.current) return
    wake.current = window.setTimeout(() => {
      wake.current = 0
      if (document.visibilityState !== 'hidden') invalidate()
    }, delay)
  })

  return quality === 'perf' ? <AdaptiveDpr /> : null
}
