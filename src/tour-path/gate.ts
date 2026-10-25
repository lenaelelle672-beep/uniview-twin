import { demoEditActive } from '../demo-edit/flag'

/**
 * T071 沿轨飞，和 T069 导览轨线预览共用这道门。
 * 默认关。观众地址两边都不打开，也不去拉各自的 drei 包。
 * 不要在这里 import drei、three 或导览播放实现。
 */

export function tourPathQueryOn(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(query)
  return params.get('tourPath') === '1' || params.get('demoEdit') === '1'
}

/** drei MotionPathControls 的 loop 默认是 true。这里默认关掉，只有地址栏显式打开才循环。 */
export function motionPathLoopOn(search?: string): boolean {
  const live = search ?? (typeof location === 'undefined' ? '' : location.search)
  const query = live.startsWith('?') ? live.slice(1) : live
  if (new URLSearchParams(query).get('tourLoop') === '1') return true
  if (search != null) return false
  return navigationFlag('tourLoop')
}

function navigationFlag(name: string): boolean {
  if (typeof performance === 'undefined') return false
  const entry = performance.getEntriesByType('navigation')[0]
  if (!entry?.name) return false
  try {
    return new URL(entry.name, 'http://localhost').searchParams.get(name) === '1'
  } catch {
    return false
  }
}

function navigationGate(): boolean {
  if (typeof performance === 'undefined') return false
  const entry = performance.getEntriesByType('navigation')[0]
  if (!entry?.name) return false
  try {
    return tourPathQueryOn(new URL(entry.name, 'http://localhost').search)
  } catch {
    return false
  }
}

/**
 * 当前地址或启动 navigation 里 `tourPath=1` 或 `demoEdit=1`。
 * 别的值（包括 `demoEdit=10`）不算打开。
 */
export function tourPathGateOn(search?: string): boolean {
  if (search != null) return tourPathQueryOn(search)
  if (typeof location !== 'undefined' && tourPathQueryOn(location.search)) return true
  return navigationGate()
}

/** 书签条上的导览按钮。播放中 React 可能把文案改成「停止导览」。 */
export function isAlarmTourLabel(text: string | null | undefined): boolean {
  const label = (text ?? '').replace(/\s+/g, '')
  return label === '导览告警' || label === '停止导览'
}

/**
 * T069：讲解相机轨预览开关。
 * 不放进 LayerFlags 的初始对象。缺省即关。
 * `layers.tourPath === true` 或地址 `?demoEdit=1` 才开。
 * 用户关掉之后本次会话不再因为 demoEdit 自动打开。
 */

export const TOUR_PATH_LAYER = 'tourPath' as const

export function tourPathLayerOn(layers: object | null | undefined): boolean {
  if (!layers) return false
  return (layers as { tourPath?: boolean }).tourPath === true
}

export function tourPathWanted(
  layers: object | null | undefined,
  search?: string,
  dismissed = false,
): boolean {
  if (dismissed) return false
  return tourPathLayerOn(layers) || demoEditActive(search)
}
