import { TWIN_TOUR_EVENT, type TwinTourDetail } from '../viewmarks/tourEvents'

/**
 * T128：dock 晚加载之后只装监听。
 * 导览会话真正开始才动态 import 巡游体。CurveModifier 不在这一层。
 */

export interface CurvePatrolSession {
  cancel: () => void
}

type LoadSession = () => Promise<{ startCurvePatrol: () => CurvePatrolSession }>

let installed = false
let loading = false
let token = 0
let cancel: (() => void) | null = null
let detach: (() => void) | null = null

function readDetail(event: Event): TwinTourDetail | null {
  const detail = (event as CustomEvent<TwinTourDetail>).detail
  if (!detail || typeof detail !== 'object') return null
  return detail
}

function halt(): void {
  token += 1
  loading = false
  const current = cancel
  cancel = null
  current?.()
}

export function resetCurvePatrolMountForTests(): void {
  halt()
  if (typeof window !== 'undefined') detach?.()
  detach = null
  installed = false
}

/** 重复调用无事。听众地址上监听还在，但没有导览会话时不会 import 巡游体。 */
export function mountCurvePatrol(load: LoadSession = () => import('./curveSession')): void {
  if (typeof window === 'undefined') return
  if (installed) return
  installed = true
  const onTour = (event: Event) => {
    const detail = readDetail(event)
    if (!detail || detail.active !== true || detail.empty === true) {
      halt()
      return
    }
    if (loading || cancel) return
    loading = true
    const mine = ++token
    void load()
      .then((mod) => {
        if (mine !== token) return
        const session = mod.startCurvePatrol()
        if (mine !== token) {
          session.cancel()
          return
        }
        cancel = () => {
          cancel = null
          session.cancel()
        }
      })
      .catch(() => {
        if (mine === token) {
          loading = false
          cancel = null
        }
      })
      .then(() => {
        if (mine === token) loading = false
      })
  }
  window.addEventListener(TWIN_TOUR_EVENT, onTour)
  detach = () => window.removeEventListener(TWIN_TOUR_EVENT, onTour)
}
