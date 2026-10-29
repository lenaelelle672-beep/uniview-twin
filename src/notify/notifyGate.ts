/**
 * T084：桌面通知开关和浏览器能力。
 * 默认关。`notify=1`，或演示模式 `demo=1` / `demoEdit=1`，才打开。
 * `notify=0` 强制关，盖过演示模式。
 * 地址栏同步会抹掉未知参数，所以同时看导航记录里的原始地址。
 * 非安全上下文、没有 Notification、权限被拒绝，都静默降级。
 */

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported'

export const NOTIFY_TAG = 'twin-alarm'

export interface NotifyOptions {
  body?: string
  tag?: string
  renotify?: boolean
}

export interface NotifyHandle {
  close?: () => void
}

export interface NotifyConstructor {
  readonly permission: string
  requestPermission?: () => Promise<string> | string
  new (title: string, options?: NotifyOptions): NotifyHandle
}

export interface NotifyHost {
  isSecureContext?: boolean
  Notification?: NotifyConstructor
}

function readFlag(search: string, key: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get(key)
}

function navigationHref(): string | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
  const entry = performance.getEntriesByType('navigation')[0] as { name?: string } | undefined
  return entry?.name ?? null
}

function searches(search?: string, navigationHrefOverride?: string | null): string[] {
  const current = search ?? (typeof location === 'undefined' ? '' : location.search)
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  const list = [current]
  if (!href) return list
  try {
    list.push(new URL(href).search)
  } catch {
    // 导航记录不是合法地址
  }
  return list
}

function anyFlag(list: readonly string[], key: string, value: string): boolean {
  return list.some((item) => readFlag(item, key) === value)
}

/** 功能是否打开。 */
export function initialNotifyEnabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const list = searches(search, navigationHrefOverride)
  if (anyFlag(list, 'notify', '0')) return false
  if (anyFlag(list, 'notify', '1')) return true
  if (anyFlag(list, 'demo', '1') || anyFlag(list, 'demoEdit', '1')) return true
  return false
}

export function readNotifyPermission(host: NotifyHost | null | undefined): NotifyPermission {
  if (host == null || host.isSecureContext === false) return 'unsupported'
  const api = host.Notification
  if (typeof api !== 'function') return 'unsupported'
  const permission = api.permission
  if (permission === 'granted' || permission === 'denied' || permission === 'default') return permission
  return 'unsupported'
}

/**
 * 必须在用户手势的调用栈里同步进入 `requestPermission`。
 * 已经允许、已经拒绝，或接口不存在时，不再弹权限。
 */
export function requestNotifyPermission(host: NotifyHost | null | undefined): Promise<NotifyPermission> {
  const current = readNotifyPermission(host)
  if (current !== 'default') return Promise.resolve(current)
  const api = host?.Notification
  const ask = api?.requestPermission
  if (!api || typeof ask !== 'function') return Promise.resolve('unsupported')
  try {
    return Promise.resolve(ask.call(api)).then(
      (result) => (result === 'granted' || result === 'denied' || result === 'default' ? result : 'denied'),
      () => 'denied' as const,
    )
  } catch {
    return Promise.resolve('denied')
  }
}

/** 权限不够或构造失败时返回 null，调用方不抛。 */
export function showDesktopAlarm(host: NotifyHost | null | undefined, body: string): NotifyHandle | null {
  if (readNotifyPermission(host) !== 'granted') return null
  const Ctor = host?.Notification
  if (typeof Ctor !== 'function') return null
  try {
    return new Ctor('告警', { body, tag: NOTIFY_TAG, renotify: true })
  } catch {
    try {
      return new Ctor('告警', { body, tag: NOTIFY_TAG })
    } catch {
      return null
    }
  }
}
