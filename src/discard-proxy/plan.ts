/**
 * T115：拾取代理加深的门闩。
 * 这里不 import drei，也不 import three。门闩可以进晚加载分包，MeshDiscardMaterial 仍留在另一包。
 * 总览不挂。`?meshDiscard=0` 关掉。窗口过一次就锁住，避免首帧标记被清掉时把代理材质退回去。
 */

export const DISCARD_PROXY_AFTER_FIRST_MS = 2600

export function searchOf(value: string): string {
  if (!value) return ''
  if (value.includes('://')) {
    try {
      return new URL(value).search
    } catch {
      return ''
    }
  }
  const hash = value.indexOf('#')
  const before = hash >= 0 ? value.slice(0, hash) : value
  const at = before.indexOf('?')
  if (at >= 0) return before.slice(at)
  return before.includes('=') ? before : ''
}

/** 地址上的 meshDiscard=0。其它取值不当开关。 */
export function discardProxyOptOut(value: string): boolean {
  return new URLSearchParams(searchOf(value)).get('meshDiscard') === '0'
}

/** 只有进层才有工位拾取代理。总览、蓝图不请求 MeshDiscardMaterial。 */
export function discardProxyWanted(view: string, search: string): boolean {
  if (view !== 'floor') return false
  return !discardProxyOptOut(search)
}

/**
 * 与天幕、软阴影同一道首帧后窗口。
 * 过了一次就锁住：RenderProbe 重跑删掉首帧标记时，不把已经加深的代理退回 visible:false 材质。
 */
export function discardProxyDue(latched: boolean, firstFrameAt: number | null | undefined, now: number): boolean {
  if (latched) return true
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now >= firstFrameAt + DISCARD_PROXY_AFTER_FIRST_MS
}
