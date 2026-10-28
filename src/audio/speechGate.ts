/**
 * T082：语音默认关。
 * `speech=1`，或演示模式 `demo=1` / `demoEdit=1`，才打开。
 * `speech=0` 强制关，盖过演示模式。
 * `muteSpeech=1` 或 `muteAudio=1` 只是静音，不把开关关掉。
 * 地址栏同步会抹掉未知参数，所以同时看导航记录里的原始地址。
 */

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

/** 功能是否打开。静音不算关。 */
export function initialSpeechEnabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const list = searches(search, navigationHrefOverride)
  if (anyFlag(list, 'speech', '0')) return false
  if (anyFlag(list, 'speech', '1')) return true
  if (anyFlag(list, 'demo', '1') || anyFlag(list, 'demoEdit', '1')) return true
  return false
}

/** 打开之后是否先静音。 */
export function initialSpeechMuted(search?: string, navigationHrefOverride?: string | null): boolean {
  const list = searches(search, navigationHrefOverride)
  return anyFlag(list, 'muteSpeech', '1') || anyFlag(list, 'muteAudio', '1')
}

/** 浏览器没有 speechSynthesis 时不占声道，提示音继续响。 */
export function speechSynthesisSupported(): boolean {
  try {
    if (typeof window === 'undefined') return false
    if (typeof SpeechSynthesisUtterance !== 'function') return false
    return 'speechSynthesis' in window && window.speechSynthesis != null
  } catch {
    return false
  }
}
