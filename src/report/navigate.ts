export const TWIN_NAVIGATE_EVENT = 'twin-navigate'

export function navigateTo(pathname: string, search: string) {
  const url = `${pathname}${search}${window.location.hash}`
  window.history.pushState(null, '', url)
  window.dispatchEvent(new Event(TWIN_NAVIGATE_EVENT))
}

export function isReportPath(pathname: string) {
  return pathname === '/report' || pathname === '/report/'
}
