let settleFirstPrefetch: () => void
const firstPrefetch = new Promise<void>((resolve) => {
  settleFirstPrefetch = resolve
})
let firstPrefetchSettled = false

function markFirstPrefetchDone() {
  if (firstPrefetchSettled) return
  firstPrefetchSettled = true
  if (typeof window !== 'undefined') {
    window.__twinFirstPrefetchDone = true
    window.__twinFirstPrefetchDoneAt = performance.now()
  }
  settleFirstPrefetch()
}

/** D195：IdlePrewarm / labels 等第一个 prefetch（textRuntime）的 import() 完成，不用定时器。 */
export function waitFirstPrefetch(): Promise<void> {
  return firstPrefetch
}

export function firstPrefetchDone(): boolean {
  return firstPrefetchSettled
}

/** 总览空闲时预取三个按需包。必须在首帧之后，预取不算进首屏。 */
export function prefetchLazyChunks(): void {
  if (window.__twinPrefetchAt != null) return
  window.__twinPrefetchAt = performance.now()
  window.__twinPrefetchUnixMs = Date.now()
  void import('./floorDecor')
  void import('../../blueprint/BlueprintView')
  void import('./textRuntime').then(() => {
    markFirstPrefetchDone()
    void import('../labels/ProgressiveRoomLabels')
  }, markFirstPrefetchDone)
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
