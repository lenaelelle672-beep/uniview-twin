/**
 * T105：同一文档里的 View Transition。
 * 只负责把一次 DOM 写入放进 `document.startViewTransition`。
 * 没有这个 API、用户偏好减少动效、或浏览器拒绝新过渡时，写入立刻发生。
 * 时长只作用在页面快照的交叉淡化上。镜头阻尼不在这个文件里。
 */

export const DOM_VIEW_TRANSITION_MS = 200

export const FLOOR_VIEW_TRANSITION_CSS = [
  '::view-transition-old(root),::view-transition-new(root){',
  `animation-duration:${DOM_VIEW_TRANSITION_MS}ms;`,
  'animation-timing-function:ease-out}',
].join('')

export interface DomViewTransition {
  finished?: Promise<void>
  ready?: Promise<void>
  updateCallbackDone?: Promise<void>
  skipTransition?: () => void
}

export type StartDomViewTransition = (update: () => void | Promise<void>) => DomViewTransition

export interface FloorViewTransitionPorts {
  start: StartDomViewTransition | null
  reduce: boolean
}

export type DomViewTransitionKind = 'transition' | 'instant'

interface DocumentWithViewTransition {
  startViewTransition?: (update: () => void) => DomViewTransition
}

let ports: FloorViewTransitionPorts | null = null
let active: DomViewTransition | null = null

/** 测试注入。生产路径保持 null，每次都读 document。 */
export function setFloorViewTransitionPorts(next: FloorViewTransitionPorts | null): void {
  ports = next
  active = null
}

export function prefersReducedMotion(): boolean {
  try {
    if (typeof matchMedia !== 'function') return false
    return matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

function reduced(): boolean {
  if (ports) return ports.reduce
  return prefersReducedMotion()
}

function browserStart(): StartDomViewTransition | null {
  if (typeof document === 'undefined') return null
  const start = (document as unknown as DocumentWithViewTransition).startViewTransition
  if (typeof start !== 'function') return null
  return (update) => start.call(document, update)
}

function starter(): StartDomViewTransition | null {
  if (ports) return ports.start
  return browserStart()
}

export function viewTransitionSupported(): boolean {
  return starter() != null && !reduced()
}

function dropActive(): void {
  const current = active
  active = null
  if (!current || typeof current.skipTransition !== 'function') return
  try {
    current.skipTransition()
  } catch {
    // 上一条已经结束时，跳过会抛。下一条仍要能开始。
  }
}

function silence(handle: DomViewTransition): void {
  const clear = () => {
    if (active === handle) active = null
  }
  const finished = handle.finished
  if (finished && typeof finished.then === 'function') {
    void finished.then(clear, clear)
  }
  const ready = handle.ready
  if (ready && typeof ready.catch === 'function') void ready.catch(() => {})
  const done = handle.updateCallbackDone
  if (done && typeof done.catch === 'function') void done.catch(() => {})
}

/**
 * `update` 只交给 startViewTransition 的回调。
 * 新版浏览器会稍后才调用回调，不能在 start 返回后抢先写入，否则快照里没有这次切换。
 * 回调可以返回 Promise。浏览器会等它结束再拍新快照。
 * API 在调用回调之前抛错时，改为立刻写入，且只写一次。回调自己抛错则原样冒出来。
 */
export function runDomViewTransition(update: () => void | Promise<void>): DomViewTransitionKind {
  const start = starter()
  if (start == null || reduced()) {
    void update()
    return 'instant'
  }
  dropActive()
  let ran = false
  const once = () => {
    if (ran) return
    ran = true
    return update()
  }
  try {
    const handle = start(once)
    if (handle) {
      active = handle
      silence(handle)
      return 'transition'
    }
    if (!ran) once()
    return ran ? 'transition' : 'instant'
  } catch (error) {
    active = null
    if (!ran) {
      once()
      return 'instant'
    }
    throw error
  }
}

interface StyleHost {
  head: { append(node: object): void }
  querySelector(selector: string): unknown
  createElement(tag: 'style'): { dataset: { floorViewTransition?: string }; textContent: string }
}

export function ensureFloorViewTransitionStyle(doc: StyleHost): void {
  if (doc.querySelector('style[data-floor-view-transition]')) return
  const style = doc.createElement('style')
  style.dataset.floorViewTransition = ''
  style.textContent = FLOOR_VIEW_TRANSITION_CSS
  doc.head.append(style)
}
