import { useEffect, useState, type ComponentType } from 'react'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import { focusFloatDeskId } from './anchor'

/**
 * 总览 hardGate 的锁机窗口会把首帧后一小段的请求算进去。
 * 和软阴影 / 楼层壳同一道 2600ms 门，聚焦包才 import。
 * 字面量留在本文件，避免为了这个数字去碰阴影模块。
 */
const FOCUS_FLOAT_AFTER_FIRST_MS = 2600

/**
 * 挂在 DemandLoop 里，这样实现不进首屏主包。
 * 没有工位落点、或取消聚焦时返回 null，卡片卸载。
 * drei Html 只活在下面那个懒包里，和测距的 Html 各走各的。
 */
export function FocusFloatHost() {
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusedDeviceId = useTwinStore((state) => state.focusedDeviceId)
  const devices = useTwinStore((state) => state.devices)
  const deskId = focusFloatDeskId(devices, { deskId: focusedDeskId, deviceId: focusedDeviceId })
  const deskKey = deskId && resolveWorkstationRef(deskId) ? deskId : ''
  const [Card, setCard] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (!deskKey) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= FOCUS_FLOAT_AFTER_FIRST_MS) {
        void import('./FocusFloatCard').then((mod) => {
          if (!cancelled) setCard(() => mod.FocusFloatCard)
        })
        return
      }
      raf = window.requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [deskKey])

  if (!deskKey || !Card) return null
  return <Card />
}
