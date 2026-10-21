import { lazy, Suspense, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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

let root: Root | null = null
let host: HTMLElement | null = null

/**
 * 挂进 .stage，时间轴仍按 stage 绝对定位。
 * 调用方是 viewmarks/dock：总览上这条包在首帧 2600ms 之后，不进均衡档 cutoff。
 * Stage 若把宿主清掉，下次 DOM 变更会再挂上。
 */
export function mountAlarmTimeline(): void {
  if (typeof document === 'undefined') return
  if (host && !host.isConnected) {
    root?.unmount()
    root = null
    host = null
  }
  if (host?.isConnected) return
  const stage = document.querySelector('.stage')
  if (!stage) return
  const next = document.createElement('div')
  stage.appendChild(next)
  host = next
  root = createRoot(next)
  root.render(<AlarmTimelineGate />)
}
