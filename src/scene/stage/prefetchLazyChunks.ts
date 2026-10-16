let settleFirstPrefetch: () => void
const firstPrefetch = new Promise<void>((resolve) => {
  settleFirstPrefetch = resolve
})
let firstPrefetchSettled = false
let scheduleArmed = false
let preferImmediate = false
let clickChunksStarted = false
let glyphChunkStarted = false
let interiorPrewarmStarted = false

/**
 * 总览楼层壳（JsonFloorInterior / glyphProbe / labels / Workstations）不能贴着首帧发。
 * d126 的 cutoff 在首帧之后一点点，+1 帧的 import 会时进时出。
 * 与室内预热同一时刻再拉，躲开首帧窗，也不提前进 D263 的 +2s 计帧。
 */
export const FLOOR_SHELL_AFTER_FIRST_MS = 2600

function markFirstPrefetchDone() {
  if (firstPrefetchSettled) return
  firstPrefetchSettled = true
  if (typeof window !== 'undefined') {
    window.__twinFirstPrefetchDone = true
    window.__twinFirstPrefetchDoneAt = performance.now()
  }
  settleFirstPrefetch()
}

/** D195：IdlePrewarm 等第一个 prefetch（textRuntime）的 import() 完成，不用定时器。 */
export function waitFirstPrefetch(): Promise<void> {
  return firstPrefetch
}

export function firstPrefetchDone(): boolean {
  return firstPrefetchSettled
}

/** 点击进层用的包。总览要等过首帧截止；人已经在楼层上才立刻拉。 */
async function prefetchClickChunks(): Promise<void> {
  if (clickChunksStarted) return
  clickChunksStarted = true
  const camera = import('./FloorStageCamera')
  const interior = import('../../floors/JsonFloorInterior')
  await camera
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
  await interior
}

/** 总览空闲时预取按需包。必须在首帧之后，预取不算进首屏。不含楼层壳。 */
export function prefetchLazyChunks(): void {
  if (window.__twinPrefetchAt != null) return
  window.__twinPrefetchAt = performance.now()
  window.__twinPrefetchUnixMs = Date.now()
  void import('../../blueprint/BlueprintView')
  void import('./textRuntime').then(markFirstPrefetchDone, markFirstPrefetchDone)
}

function scheduleGlyphChunk(): void {
  if (glyphChunkStarted) return
  glyphChunkStarted = true
  void import('./preloadFloorGlyphs').then((mod) => {
    mod.scheduleGlyphPreload()
  })
}

function scheduleInteriorPrewarm(): void {
  if (interiorPrewarmStarted) return
  interiorPrewarmStarted = true
  void import('./prewarmFloorInterior').then((mod) => {
    mod.scheduleFloorInteriorPrewarm()
  })
}

function startFloorShellNow(): void {
  if (window.__twinFloorShellAt == null) window.__twinFloorShellAt = performance.now()
  void import('./floorDecor')
  void import('../labels/ProgressiveRoomLabels')
  void prefetchClickChunks()
  scheduleInteriorPrewarm()
  scheduleGlyphChunk()
}

/** 总览：等过首帧截止再拉楼层壳。进层路径不走这里。 */
function scheduleFloorShellAfterCutoff(): void {
  const tick = () => {
    const first = window.__twinFirstFrameAt
    if (first == null || performance.now() - first < FLOOR_SHELL_AFTER_FIRST_MS) {
      window.requestAnimationFrame(tick)
      return
    }
    startFloorShellNow()
  }
  window.requestAnimationFrame(tick)
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
    if (preferImmediate || window.__twinView === 'floor') {
      startFloorShellNow()
      prefetchLazyChunks()
      return
    }
    scheduleFloorShellAfterCutoff()
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
  if (window.__twinReady === true && window.__twinFirstFrameAt != null) {
    startFloorShellNow()
    if (window.__twinPrefetchAt == null) prefetchLazyChunks()
    return
  }
  schedulePrefetchAfterFirstFrame()
}
