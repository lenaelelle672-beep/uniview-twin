/**
 * T058 摆点开关。
 *
 * 地址栏同步只回写已知参数，启动时的 `?demoEdit=1` 会先被丢掉。
 * Performance navigation 仍是第一次打开的地址，DemandLoop 挂上后据此写回，
 * 并包住后续 replaceState。默认没有这个参数时，这里什么都不改。
 */

export function demoEditRequested(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('demoEdit') === '1'
}

export function searchFromNavigationName(name: string): string {
  try {
    return new URL(name, 'http://localhost').search
  } catch {
    return ''
  }
}

export function navigationSearch(): string {
  if (typeof performance === 'undefined') return ''
  const entry = performance.getEntriesByType('navigation')[0]
  if (!entry?.name) return ''
  return searchFromNavigationName(entry.name)
}

/** 启动地址或当前地址栏里有 `demoEdit=1`。 */
export function demoEditActive(search?: string): boolean {
  const live = search ?? (typeof location === 'undefined' ? '' : location.search)
  return demoEditRequested(live) || demoEditRequested(navigationSearch())
}

export function withDemoEdit(search: string, enabled: boolean): string {
  if (!enabled || demoEditRequested(search)) return search
  return `${search}${search.includes('?') ? '&' : '?'}demoEdit=1`
}

export function withDemoEditUrl(url: string): string {
  const hashAt = url.indexOf('#')
  const hash = hashAt >= 0 ? url.slice(hashAt) : ''
  const before = hashAt >= 0 ? url.slice(0, hashAt) : url
  const queryAt = before.indexOf('?')
  const path = queryAt >= 0 ? before.slice(0, queryAt) : before
  const search = queryAt >= 0 ? before.slice(queryAt) : ''
  return `${path}${withDemoEdit(search, true)}${hash}`
}

let patched = false
let originalReplace: History['replaceState'] | null = null

/** 包住 replaceState，让 demoEdit=1 留在地址栏。调用方先确认开关已经打开。 */
export function installDemoEditHistoryPatch(): void {
  if (patched || typeof history === 'undefined' || typeof location === 'undefined') return
  patched = true
  originalReplace = history.replaceState.bind(history)
  const replace = originalReplace
  history.replaceState = ((data: unknown, unused: string, url?: string | URL | null) => {
    if (typeof url === 'string') replace(data, unused, withDemoEditUrl(url))
    else if (url instanceof URL) replace(data, unused, withDemoEditUrl(url.toString()))
    else replace(data, unused, url)
  }) as History['replaceState']
  const current = `${location.pathname}${location.search}${location.hash}`
  replace(history.state, '', withDemoEditUrl(current))
}

/** 启动地址带 demoEdit=1 时才写回。默认演示路径不改 history。 */
export function retainDemoEditParam(): void {
  if (!demoEditActive()) return
  installDemoEditHistoryPatch()
}

export function resetDemoEditRetainForTests(): void {
  if (patched && originalReplace) history.replaceState = originalReplace
  patched = false
  originalReplace = null
}
