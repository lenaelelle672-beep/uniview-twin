/** 总览空闲时预取三个按需包。必须在首帧之后，预取不算进首屏。 */
export function prefetchLazyChunks(): void {
  window.__twinPrefetchAt = performance.now()
  window.__twinPrefetchUnixMs = Date.now()
  void import('./floorDecor')
  void import('./textRuntime')
  void import('../../blueprint/BlueprintView')
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
 * D120：等总览就绪且第一个完整帧画出之后再预取。
 * 顺序：__twinReady → 首帧 useFrame 时间戳 → 再多 1 个 rAF → 可选 idle → 发请求。
 * 不能只靠 requestIdleCallback / setTimeout。
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
