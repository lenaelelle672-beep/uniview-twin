import { useEffect, useState } from 'react'
import { isCameraRested, subscribeCameraRest } from './cameraRest'

/**
 * 飞入当帧不挂 FloorDecor / 吊顶 / 工位闪烁。
 * 停稳后再隔一帧挂上，躲开进层绘制。
 */
export function useFloorExtrasReady(floorId: string): boolean {
  const [readyId, setReadyId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let first = 0
    let second = 0
    const clearTimers = () => {
      if (first) cancelAnimationFrame(first)
      if (second) cancelAnimationFrame(second)
      first = 0
      second = 0
    }
    const arm = () => {
      if (cancelled || !isCameraRested()) return
      clearTimers()
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          if (!cancelled && isCameraRested()) setReadyId(floorId)
        })
      })
    }
    arm()
    const unsubscribe = subscribeCameraRest(arm)
    return () => {
      cancelled = true
      clearTimers()
      unsubscribe()
    }
  }, [floorId])

  return readyId === floorId
}
