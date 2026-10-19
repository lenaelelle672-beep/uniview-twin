import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import {
  assetOverlayVisible,
  assetProgressSnapshot,
  blankSuspenseCount,
  subscribeAssetProgress,
  subscribeBlankSuspense,
} from '../scene/assetLoad'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'

const AssetLoadProgress = lazy(() =>
  import('./AssetLoadProgress').then((mod) => ({ default: mod.AssetLoadProgress })),
)

/**
 * 盖住空白 Suspense 的轻量 DOM 条。
 * 百分比来自首帧窗口之后才加载的 drei useProgress。
 * 不用 <Loader>：它是全屏黑底，延迟 300ms 才消失，会挡住点击和首屏字节。
 * pointer-events: none，不写 __twinReady。
 */
export function AssetLoadOverlay() {
  const blanks = useSyncExternalStore(subscribeBlankSuspense, blankSuspenseCount, blankSuspenseCount)
  const progressSnap = useSyncExternalStore(subscribeAssetProgress, assetProgressSnapshot, assetProgressSnapshot)
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && window.__twinReady === true)
  const [progressOn, setProgressOn] = useState(false)

  useEffect(() => {
    if (ready) return undefined
    const id = window.setInterval(() => {
      if (window.__twinReady === true) setReady(true)
    }, 80)
    return () => window.clearInterval(id)
  }, [ready])

  useEffect(() => {
    let raf = 0
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= SOFT_SHADOW_CHUNK_AFTER_FIRST_MS) {
        setProgressOn(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  if (!assetOverlayVisible({ blanks, loading: progressSnap.active, ready })) return null
  const pct = Number.isFinite(progressSnap.progress) ? Math.max(0, Math.min(100, progressSnap.progress)) : 0
  const indeterminate = pct <= 0 || pct >= 100
  const label = !indeterminate ? `正在加载场景 ${Math.round(pct)}%` : '正在加载场景…'
  return (
    <>
      {progressOn ? (
        <Suspense fallback={null}>
          <AssetLoadProgress />
        </Suspense>
      ) : null}
      <div className="asset-load" role="status" aria-live="polite" data-twin-asset-load="1">
        <div className="asset-load-track" aria-hidden="true">
          <div
            className={indeterminate ? 'asset-load-bar is-indeterminate' : 'asset-load-bar'}
            style={indeterminate ? undefined : { transform: `scaleX(${pct / 100})` }}
          />
        </div>
        <span>{label}</span>
      </div>
    </>
  )
}
