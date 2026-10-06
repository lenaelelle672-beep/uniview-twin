import { lazy, Suspense, useEffect, useState } from 'react'

const IdlePrewarm = lazy(async () => {
  const mod = await import('./IdlePrewarm')
  return { default: mod.IdlePrewarm }
})

/**
 * 首帧和 ready 之后才动态挂预热。
 * 门闩本身不引入 troika / 楼层图纸，避免首帧多请求。
 */
export function PrewarmGate() {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      if (window.__twinReady === true && window.__twinFirstFrameAt != null) {
        setArmed(true)
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [])

  if (!armed) return null
  return (
    <Suspense fallback={null}>
      <IdlePrewarm />
    </Suspense>
  )
}
