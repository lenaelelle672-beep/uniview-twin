import { AdaptiveDpr } from '@react-three/drei/core/AdaptiveDpr'
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { bindTwinInvalidate, flushTwinInvalidate } from '../../scene/demandInvalidate'
import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  emptyChannelClock,
  markDueChannels,
  retainFrameChannel,
  soonestWakeMs,
} from '../../scene/frameSchedule'
import { useTwinStore } from '../../store/store'

/**
 * demand 模式下的统一续帧：store 变化 invalidate、动画节流、隐藏停帧、阴影只烘一次。
 * AdaptiveDpr 只在性能档挂载。
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

  useEffect(() => {
    const release = retainFrameChannel('motion')
    const timer = window.setTimeout(release, 700)
    return () => {
      window.clearTimeout(timer)
      release()
    }
  }, [quality, view])

  useFrame(() => {
    window.__twinFrameCount = (window.__twinFrameCount ?? 0) + 1
    window.__twinLastFrameAt = performance.now()
    if (document.visibilityState === 'hidden') return
    const now = performance.now()
    const delay = soonestWakeMs(last.current, quality, now, false)
    if (!Number.isFinite(delay)) return
    if (delay === 0) {
      markDueChannels(last.current, quality, now)
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
