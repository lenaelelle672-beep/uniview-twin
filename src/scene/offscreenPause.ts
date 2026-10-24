/**
 * T067：画布容器离开视口时暂停需求泵。只使用浏览器 API。
 * 标签页隐藏仍由 DemandLoop 的 visibilitychange 负责，这里只管滚出视口。
 */

let offscreen = false

export function canvasOffscreen(): boolean {
  return offscreen
}

/** 测试与卸载后把模块标志拨回。 */
export function resetCanvasOffscreen(): void {
  offscreen = false
}

export type OffscreenHandlers = {
  onPause: () => void
  onResume: () => void
}

/**
 * IntersectionObserver 的 root 候选，按优先顺序尝试。
 * 顶层页面只用隐式视口（null）。
 * 在 iframe 里：父文档的 frameElement 不是本文档的祖先，拿来当 root 会抛。
 * 先试 null（视口，合规实现会连祖先帧一起裁），构造失败再退回本文档。
 * 只有 frame 和目标在同一文档、并且确实包住目标时，才把它放在第一位。
 */
export function observerRoots(target: Element): Array<Element | Document | null> {
  const doc = target.ownerDocument
  const view = doc?.defaultView ?? null
  let frame: Element | null = null
  let framed = false
  if (view) {
    try {
      frame = view.frameElement
      framed = frame != null
    } catch {
      framed = true
    }
  }
  const roots: Array<Element | Document | null> = []
  if (frame && doc && frame.ownerDocument === doc && frame.contains(target)) roots.push(frame)
  roots.push(null)
  if (framed && doc) roots.push(doc)
  return roots
}

/** 观察画布容器。容器是 `.scene-root`，没有时退回 canvas 自身。 */
export function canvasContainer(canvas: Element): Element {
  if (typeof canvas.closest !== 'function') return canvas
  return canvas.closest('.scene-root') ?? canvas
}

/**
 * 离开视口只回调一次 onPause，回到视口只回调一次 onResume。
 * 标志在回调之前写好，需求泵读到的是新状态。
 */
export function watchCanvasOffscreen(target: Element, watch: OffscreenHandlers): () => void {
  const Observer = globalThis.IntersectionObserver
  if (typeof Observer !== 'function') return () => {}

  let active = true
  const onEntries: IntersectionObserverCallback = (entries) => {
    if (!active) return
    const entry = entries[entries.length - 1]
    if (!entry) return
    const next = entry.isIntersecting === false
    if (next === offscreen) return
    offscreen = next
    if (next) watch.onPause()
    else watch.onResume()
  }

  let observer: IntersectionObserver | null = null
  for (const root of observerRoots(target)) {
    try {
      observer = new Observer(onEntries, { root, threshold: 0 })
      break
    } catch {
      observer = null
    }
  }
  if (!observer) return () => {}

  try {
    observer.observe(target)
  } catch {
    active = false
    observer.disconnect()
    offscreen = false
    return () => {}
  }

  const watched = observer
  return () => {
    active = false
    watched.disconnect()
    offscreen = false
  }
}
