/** 总览空闲时预取三个按需包。必须在首帧之后，预取不算进首屏。 */
export function prefetchLazyChunks(): void {
  window.__twinPrefetchAt = performance.now()
  window.__twinPrefetchUnixMs = Date.now()
  void import('./floorDecor')
  void import('./textRuntime').then(() => {
    void fetch('/fonts/NotoSansSC-Regular-subset.woff', { cache: 'force-cache' }).catch(() => {})
  })
  void import('../../blueprint/BlueprintView')
  void import('./preloadFloorGlyphs').then((mod) => {
    mod.scheduleGlyphPreload()
  })
}

function waitUntil(ok: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (ok()) {
      resolve()
      return
    }
    const tick = () => {
      if (ok()) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

/**
 * D120 / D126：HDR+PMREM 与 Suspense 资源都就绪后才 __twinReady，
 * 再等首帧 useFrame、多 1 个 rAF、可选 idle，然后才发三个 import()。
 */
export function schedulePrefetchAfterFirstFrame(): () => void {
  let cancelled = false
  let idleId = 0

  const run = async () => {
    await waitUntil(() => window.__twinReady === true)
    if (cancelled) return
    await waitUntil(() => window.__twinFirstFrameAt != null)
    if (cancelled) return
    await nextFrame()
    if (cancelled) return
    const go = () => {
      if (cancelled) return
      prefetchLazyChunks()
    }
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(go, { timeout: 4000 })
    } else {
      go()
    }
  }

  void run()

  return () => {
    cancelled = true
    if (idleId && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId)
    }
  }
}
