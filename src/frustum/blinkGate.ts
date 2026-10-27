/**
 * T076：告警闪烁宿主读这里决定还要不要续帧。
 * 本文件不引用 drei 或 three。视锥检测在另一条懒包里，默认不加载。
 * 标志没挂上或 on 为 false 时，闪烁跟改之前一样。
 */

export const FRUSTUM_BLINK_EVENT = 'twin-frustum-blink'

export interface FrustumBlinkState {
  on: boolean
  reason: 'off' | 'perf' | 'query' | 'query-off'
  scale: number
  primed: boolean
  /** null：场景里还没有这个宿主，按「仍在跑」处理。false：视锥外，停贵逻辑。 */
  alarm: boolean | null
  flash: boolean | null
  sign: boolean | null
  lamps: number
  lampsHidden: number
}

type BlinkHost = 'alarm' | 'flash'

function root(): typeof globalThis & { __twinFrustumBlink?: FrustumBlinkState } {
  return globalThis as typeof globalThis & { __twinFrustumBlink?: FrustumBlinkState }
}

export function blinkLive(host: BlinkHost): boolean {
  const state = root().__twinFrustumBlink
  if (!state?.on) return true
  return state[host] !== false
}

export function subscribeBlink(onChange: () => void): () => void {
  const target = root() as typeof globalThis & {
    addEventListener?: (type: string, fn: () => void) => void
    removeEventListener?: (type: string, fn: () => void) => void
  }
  if (typeof target.addEventListener !== 'function') return () => {}
  const handler = () => onChange()
  target.addEventListener(FRUSTUM_BLINK_EVENT, handler)
  return () => target.removeEventListener?.(FRUSTUM_BLINK_EVENT, handler)
}

export function emitBlink(state: FrustumBlinkState): void {
  const target = root()
  target.__twinFrustumBlink = state
  const dispatcher = target as typeof globalThis & { dispatchEvent?: (event: Event) => boolean }
  if (typeof dispatcher.dispatchEvent !== 'function' || typeof Event !== 'function') return
  dispatcher.dispatchEvent(new Event(FRUSTUM_BLINK_EVENT))
}
