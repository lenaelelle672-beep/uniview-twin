import { lazy, Suspense, useEffect, useState } from 'react'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { useTwinStore } from '../store/store'

const AlarmTimeline = lazy(() => import('../alarms-demo/AlarmTimeline').then((mod) => ({ default: mod.AlarmTimeline })))

/**
 * 时间轴 UI 和过滤在独立分包里。
 * 进层之后也等过首帧 cutoff 再 import，不跟硬门禁抢同一段窗口。
 */
export function AlarmTimelineGate() {
  const view = useTwinStore((state) => state.view)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (view !== 'floor') {
      setOpen(false)
      return
    }
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= SOFT_SHADOW_CHUNK_AFTER_FIRST_MS) {
        setOpen(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [view])

  if (view !== 'floor' || !open) return null
  return (
    <Suspense fallback={null}>
      <AlarmTimeline />
    </Suspense>
  )
}
