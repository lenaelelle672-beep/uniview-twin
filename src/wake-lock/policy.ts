/**
 * T085：大屏常亮的开关。
 * 默认关。`wakeLock=1`，或演示模式 `demo=1` / `demoEdit=1`，才打开。
 * `wakeLock=0` 强制关，盖过演示模式。
 * 地址栏同步会抹掉未知参数，所以同时看导航记录里的原始地址。
 * 不读全屏、画中画、语音或总线。
 */

function readFlag(search: string, key: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  try {
    return new URLSearchParams(query).get(key)
  } catch {
    return null
  }
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

function searches(search?: string, navigationHrefOverride?: string | null): string[] {
  const current = search ?? readLocationSearch()
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  const list = [current]
  if (!href) return list
  try {
    list.push(new URL(href).search)
  } catch {
    // 导航记录不是合法地址。
  }
  return list
}

function readLocationSearch(): string {
  try {
    if (typeof location === 'undefined') return ''
    return location.search
  } catch {
    return ''
  }
}

function anyFlag(list: readonly string[], key: string, value: string): boolean {
  return list.some((item) => readFlag(item, key) === value)
}

/** `wakeLock=0` 强制关掉，演示模式也不能再打开。 */
export function wakeLockForceOff(search?: string, navigationHrefOverride?: string | null): boolean {
  return anyFlag(searches(search, navigationHrefOverride), 'wakeLock', '0')
}

/**
 * 功能是否一开始就打开。
 * 只认正好等于 `1` 的 demo / demoEdit / wakeLock。`demo=10` 不算。
 */
export function initialWakeLockEnabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const list = searches(search, navigationHrefOverride)
  if (anyFlag(list, 'wakeLock', '0')) return false
  if (anyFlag(list, 'wakeLock', '1')) return true
  if (anyFlag(list, 'demo', '1') || anyFlag(list, 'demoEdit', '1')) return true
  return false
}

/**
 * 安全上下文里才有 Screen Wake Lock。
 * 非安全上下文、或没有 `request`，都当成不可用，调用方不要去申请。
 */
export function wakeLockSupported(host: {
  wakeLock?: { request?: unknown } | null
  isSecureContext?: boolean
} | null): boolean {
  if (!host) return false
  if (host.isSecureContext === false) return false
  const api = host.wakeLock
  if (!api) return false
  return typeof api.request === 'function'
}
