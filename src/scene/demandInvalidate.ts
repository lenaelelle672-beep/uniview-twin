type Resolve = () => void

const waiters: Resolve[] = []

/** 挂到 window.__twinInvalidate。只打标记，不加载资源。 */
export function bindTwinInvalidate(invalidate: () => void): void {
  window.__twinInvalidate = () =>
    new Promise<void>((resolve) => {
      waiters.push(resolve)
      invalidate()
    })
}

/** 这一帧真正画完后（R3F after-effect）再 resolve。无等待者时为零开销。 */
export function flushTwinInvalidate(): void {
  if (waiters.length === 0) return
  const batch = waiters.splice(0, waiters.length)
  for (const resolve of batch) resolve()
}
