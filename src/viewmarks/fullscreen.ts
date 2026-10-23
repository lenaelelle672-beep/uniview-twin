/**
 * T061：演示全屏。
 * 书签条晚于首帧 cutoff 才 import 本文件，不进 hardGate / balancedFx。
 * 进入和退出都发生在点击或 F 的用户手势里。
 * 没有手势、或不支持 Fullscreen API 时只返回说明，不抛。
 * Esc 退出交给浏览器，本文件不监听键盘。
 */

export interface FullscreenResult {
  ok: boolean
  active: boolean
  message: string
}

export interface FullscreenHost {
  documentElement: Element
  fullscreenElement: Element | null
  exitFullscreen?: () => Promise<void>
  querySelector: (selector: string) => Element | null
}

const SCENE_HOST = '.scene-root'

export function fullscreenOffFromSearch(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('nofullscreen') === '1'
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
 * `?nofullscreen=1`。地址栏同步会把未知参数抹掉，所以同时看导航记录里的原始地址。
 */
export function fullscreenDisabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const current = search ?? (typeof location === 'undefined' ? '' : location.search)
  if (fullscreenOffFromSearch(current)) return true
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  if (!href) return false
  try {
    return fullscreenOffFromSearch(new URL(href).search)
  } catch {
    return false
  }
}

/** 优先画布容器，没有再退到整页根节点。 */
export function pickFullscreenElement(host: Pick<FullscreenHost, 'documentElement' | 'querySelector'>): Element {
  return host.querySelector(SCENE_HOST) ?? host.documentElement
}

function browserHost(): FullscreenHost | null {
  if (typeof document === 'undefined') return null
  return document
}

type Requestable = Element & { requestFullscreen?: () => Promise<void> }

export async function toggleFullscreen(
  host?: FullscreenHost | null,
  search?: string,
  navigationHrefOverride?: string | null,
): Promise<FullscreenResult> {
  if (fullscreenDisabled(search, navigationHrefOverride)) {
    return { ok: false, active: false, message: '全屏已关闭' }
  }
  const doc = host === undefined ? browserHost() : host
  if (!doc) return { ok: false, active: false, message: '当前浏览器不能全屏' }
  const active = doc.fullscreenElement != null
  try {
    if (active) {
      if (typeof doc.exitFullscreen !== 'function') {
        return { ok: false, active: true, message: '当前浏览器不能退出全屏' }
      }
      await doc.exitFullscreen()
      return { ok: true, active: false, message: '已退出全屏' }
    }
    const target = pickFullscreenElement(doc) as Requestable
    if (typeof target.requestFullscreen !== 'function') {
      return { ok: false, active: false, message: '当前浏览器不能全屏' }
    }
    await target.requestFullscreen()
    return { ok: true, active: true, message: '已进入全屏，Esc 退出' }
  } catch {
    return { ok: false, active: doc.fullscreenElement != null, message: '全屏没有完成' }
  }
}
