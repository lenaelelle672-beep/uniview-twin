type ShortcutKeyEvent = {
  key: string
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  target: EventTarget | ShortcutTarget | null
}

type ShortcutTarget = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

/** 输入框、可编辑区、告警抽屉（原生 dialog）聚焦时不抢键。 */
export function shortcutTargetBlocks(target: EventTarget | ShortcutTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const node = target as ShortcutTarget
  const tag = node.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (node.isContentEditable === true) return true
  if (typeof node.closest === 'function' && node.closest('dialog')) return true
  return false
}

/** `?` 开关速查。Shift 是问号本身的一部分，不拦；Ctrl / Alt / Meta 留给浏览器。 */
export function acceptsShortcutToggle(event: ShortcutKeyEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat) return false
  if (event.altKey || event.metaKey || event.ctrlKey) return false
  if (event.key !== '?') return false
  return !shortcutTargetBlocks(event.target)
}
