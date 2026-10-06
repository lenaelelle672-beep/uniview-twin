import { ROOM_LABEL_FONT } from '../stage/roomLabels'

export function textRuntimePrefetchDone(): boolean {
  return performance.getEntriesByType('resource').some((entry) => {
    const resource = entry as PerformanceResourceTiming
    return resource.name.includes('textRuntime') && resource.responseEnd > 0
  })
}

export function woffAlreadyRequested(): boolean {
  return performance.getEntriesByType('resource').some((entry) => {
    return /NotoSansSC-Regular-subset\.woff/i.test(entry.name)
  })
}

/** D188：woff 必须等 textRuntime 预取完成后再发，不要和预取抢带宽。 */
export async function waitTextRuntimePrefetch(timeoutMs = 20_000): Promise<boolean> {
  const deadline = performance.now() + timeoutMs
  while (!textRuntimePrefetchDone()) {
    if (performance.now() >= deadline) return false
    await new Promise<void>((resolve) => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 400 })
        return
      }
      window.setTimeout(() => resolve(), 40)
    })
  }
  return true
}

export async function preloadLabelFont(characters: string): Promise<void> {
  const { disableTroikaCdnFallback } = await import('../stage/disableTroikaCdn')
  disableTroikaCdnFallback()
  const { preloadFont } = await import('troika-three-text')
  await new Promise<void>((resolve, reject) => {
    try {
      preloadFont({ font: ROOM_LABEL_FONT, characters }, () => resolve())
    } catch (error) {
      reject(error)
    }
  })
}
