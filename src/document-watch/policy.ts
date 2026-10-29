/**
 * T087：文档画中画值守的纯策略。
 * 小窗走 documentPictureInPicture.requestWindow，只挂告警 DOM。
 * 不读视频值守的开关，不搬主页面的画面，也不碰雾、镜头 smoothTime、后处理。
 * 这扇小窗是同一标签里的文档窗，不是 T081 的另一个标签。
 * 这里不接力焦点、视角令牌、告警编号或图层。
 */

export const DOCUMENT_WATCH_WIDTH = 320
export const DOCUMENT_WATCH_HEIGHT = 420
export const WATCH_ROW_LIMIT = 6

export type DocumentWatchPhase = 'idle' | 'open'

export interface DocumentWatchOpenOptions {
  width: number
  height: number
  disallowReturnToOpener: false
}

export interface CanvasParent {
  append(node: unknown): void
}

export interface CanvasSeat {
  node: unknown
  parent: CanvasParent | null
}

export interface DocumentWatchButtonView {
  text: string
  pressed: 'true' | 'false'
  disabled: boolean
  title: string
  label: string
}

export function documentWatchOffFromSearch(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('docpip') === '0'
}

function navigationHref(): string | null {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
    const entry = performance.getEntriesByType('navigation')[0] as { name?: string } | undefined
    return entry?.name ?? null
  } catch {
    return null
  }
}

/**
 * `?docpip=0` 关掉文档值守。地址栏同步会抹掉未知参数，所以同时看导航记录里的原始地址。
 * 不读视频值守的参数。
 */
export function documentWatchDisabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const current = search ?? (typeof location === 'undefined' ? '' : location.search)
  if (documentWatchOffFromSearch(current)) return true
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  if (!href) return false
  try {
    return documentWatchOffFromSearch(new URL(href).search)
  } catch {
    return false
  }
}

/** 只有文档窗的 requestWindow 算支持。视频元素上的接口不算。 */
export function documentWatchApiAvailable(host: {
  documentPictureInPicture?: { requestWindow?: unknown } | null
} | null | undefined): boolean {
  const api = host?.documentPictureInPicture
  if (!api) return false
  return typeof api.requestWindow === 'function'
}

export function documentWatchSupported(): boolean {
  if (typeof window === 'undefined') return false
  return documentWatchApiAvailable(window)
}

/**
 * 打开必须同时有手势、接口、并且没被关掉。
 * 已经开着时，再一次手势是关闭。没有手势时保持原样，不自动开，也不自动关。
 */
export function mayRequestDocumentWindow(input: {
  disabled: boolean
  supported: boolean
  gesture: boolean
  phase: DocumentWatchPhase
  pending: boolean
}): 'open' | 'close' | 'skip' {
  if (input.phase === 'open') return input.gesture ? 'close' : 'skip'
  if (input.disabled || !input.supported || !input.gesture || input.pending) return 'skip'
  return 'open'
}

export function documentWatchButton(input: {
  phase: DocumentWatchPhase
  disabled: boolean
  supported: boolean
}): DocumentWatchButtonView {
  if (input.disabled) {
    return {
      text: '文档值守',
      pressed: 'false',
      disabled: true,
      title: '地址栏带 ?docpip=0，已关闭文档值守',
      label: '文档值守已关闭',
    }
  }
  if (!input.supported) {
    return {
      text: '文档值守',
      pressed: 'false',
      disabled: true,
      title: '当前浏览器没有文档画中画',
      label: '当前浏览器没有文档画中画',
    }
  }
  if (input.phase === 'open') {
    return {
      text: '回到主页',
      pressed: 'true',
      disabled: false,
      title: '关闭文档值守并回到主页',
      label: '关闭文档值守并回到主页',
    }
  }
  return {
    text: '文档值守',
    pressed: 'false',
    disabled: false,
    title: '打开文档小窗，只看告警列表。画面留在主页',
    label: '打开文档值守',
  }
}

/** 同一个画面节点换了父节点，才算被搬走。 */
export function canvasMoved(before: CanvasSeat | null, after: CanvasSeat | null): boolean {
  if (!before?.node || !before.parent) return false
  if (!after || after.node !== before.node) return false
  return after.parent !== before.parent
}

export function restoreCanvas(before: CanvasSeat | null): void {
  if (!before?.node || !before.parent) return
  try {
    before.parent.append(before.node)
  } catch {
    // 放不回去也不抛。
  }
}

/** 小窗文档里不留画面节点。查不到文档就当作不能用。 */
export function documentHasPicture(doc: { querySelector?: (selector: string) => unknown } | null | undefined): boolean {
  if (!doc || typeof doc.querySelector !== 'function') return true
  try {
    return doc.querySelector('canvas, video') != null
  } catch {
    return true
  }
}
