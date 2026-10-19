import { useProgress } from '@react-three/drei/core/Progress'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  assetOverlayVisible,
  blankSuspenseCount,
  subscribeBlankSuspense,
} from '../scene/assetLoad'

/**
 * 盖住空白 Suspense 的轻量 DOM 条。
 * drei 10.7.9 useProgress 接 DefaultLoadingManager，显示百分比。
 * 不用 <Loader>：它是全屏黑底，延迟 300ms 才消失，会挡住点击和首屏字节。
 * pointer-events: none，不写 __twinReady。
 */
export function AssetLoadOverlay() {
  const { active, progress } = useProgress()
  const blanks = useSyncExternalStore(subscribeBlankSuspense, blankSuspenseCount, blankSuspenseCount)
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && window.__twinReady === true)

  useEffect(() => {
    if (ready) return undefined
    const id = window.setInterval(() => {
      if (window.__twinReady === true) setReady(true)
    }, 80)
    return () => window.clearInterval(id)
  }, [ready])

  if (!assetOverlayVisible({ blanks, loading: active, ready })) return null
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0
  const indeterminate = pct <= 0 || pct >= 100
  const label = !indeterminate ? `正在加载场景 ${Math.round(pct)}%` : '正在加载场景…'
  return (
    <div className="asset-load" role="status" aria-live="polite" data-twin-asset-load="1">
      <div className="asset-load-track" aria-hidden="true">
        <div
          className={indeterminate ? 'asset-load-bar is-indeterminate' : 'asset-load-bar'}
          style={indeterminate ? undefined : { transform: `scaleX(${pct / 100})` }}
        />
      </div>
      <span>{label}</span>
    </div>
  )
}
