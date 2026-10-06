let settleFirstPrefetch: () => void
const firstPrefetch = new Promise<void>((resolve) => {
  settleFirstPrefetch = resolve
})
let firstPrefetchSettled = false
let scheduleArmed = false
let preferImmediate = false

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
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  })
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function startWhenReady(): void {
  const run = async () => {
    await waitUntil(() => window.__twinReady === true)
    await waitUntil(() => window.__twinFirstFrameAt != null)
    await nextFrame()
    if (preferImmediate) {
      prefetchLazyChunks()
      return
    }
    const go = () => {
      prefetchLazyChunks()
    }
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(go, { timeout: 4000 })
    } else {
      go()
    }
  }

  void run()
}

/**
 * D120 / D126：HDR+PMREM 与 Suspense 资源都就绪后才 __twinReady，
 * 再等首帧 useFrame、多 1 个 rAF、可选 idle，然后才发三个 import()。
 * D223：模块级单例，离开 building 不取消；重复调用不会再调度。
 */
export function schedulePrefetchAfterFirstFrame(): void {
  if (scheduleArmed) return
  scheduleArmed = true
  startWhenReady()
}

/**
 * D223：进楼层或直接打开楼层 URL 时，若首次 prefetch 还没发出就立刻启动。
 * 仍必须等首帧；首帧未到则只把后续调度改成立即，不提前 import。
 */
export function ensurePrefetchStarted(): void {
  preferImmediate = true
  if (typeof window === 'undefined') return
  if (window.__twinPrefetchAt != null) return
  if (window.__twinReady === true && window.__twinFirstFrameAt != null) {
    prefetchLazyChunks()
    return
  }
  schedulePrefetchAfterFirstFrame()
}
