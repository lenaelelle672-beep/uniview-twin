/** 键盘档。滑杆本身可以停在 0 和 1 之间的任意位置。 */
export const EXPLODE_STOPS = [0, 0.5, 1] as const

const STEP_EPS = 1e-4

export function clampExplodeProgress(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  if (value > 1) return 1
  return value
}

/** 向下一档或上一档。已经在端点上就停住。 */
export function stepExplodeStop(current: number, direction: -1 | 1): number {
  const value = clampExplodeProgress(current)
  if (direction > 0) {
    for (const stop of EXPLODE_STOPS) {
      if (stop > value + STEP_EPS) return stop
    }
    return 1
  }
  for (let index = EXPLODE_STOPS.length - 1; index >= 0; index -= 1) {
    const stop = EXPLODE_STOPS[index] ?? 0
    if (stop < value - STEP_EPS) return stop
  }
  return 0
}

/** 有进度就收拢，没有就完全展开。和总览上的爆炸按钮一致。 */
export function toggleExplodeProgress(current: number): number {
  return clampExplodeProgress(current) > STEP_EPS ? 0 : 1
}

export type ExplodeKeyAction = 'down' | 'up' | 'toggle'

export function explodeKeyAction(event: { key?: string }): ExplodeKeyAction | null {
  const key = event.key ?? ''
  if (key === 'e' || key === 'E') return 'toggle'
  if (key === '[') return 'down'
  if (key === ']') return 'up'
  return null
}

export type ExplodeEscape = 'blur' | 'swallow' | 'pass'

/**
 * 单层里滑杆正聚焦，或刚用过滑杆/档位时，第一次 Esc 不返回总览。
 * 搜索框、抽屉和已经在忙的测距/对焦仍交给原来的 Esc。
 */
export function explodeEscapeAction(
  event: { key?: string; target: EventTarget | KeyTarget | null },
  state: { view: string; sliderFocused: boolean; spare: boolean; busy: boolean },
): ExplodeEscape {
  if (event.key !== 'Escape' || state.busy || state.view !== 'floor') return 'pass'
  const node = event.target
  if (node && typeof node === 'object') {
    const target = node as KeyTarget
    if (target.dataset?.explodeProgress == null) {
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'pass'
      if (target.isContentEditable === true) return 'pass'
      if (typeof target.closest === 'function' && target.closest('dialog')) return 'pass'
    }
  }
  if (state.sliderFocused) return 'blur'
  if (state.spare) return 'swallow'
  return 'pass'
}

type KeyTarget = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
  dataset?: { explodeProgress?: string }
}

/** 输入框、抽屉和组合键不抢。滑杆自己仍响应 E / [ / ]。 */
export function explodeProgressKeyBlocked(event: {
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
  target: EventTarget | KeyTarget | null
}): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat) return true
  if (event.altKey || event.metaKey || event.ctrlKey) return true
  const node = event.target
  if (!node || typeof node !== 'object') return false
  const target = node as KeyTarget
  if (target.dataset?.explodeProgress != null) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable === true) return true
  if (typeof target.closest === 'function' && target.closest('dialog')) return true
  return false
}
