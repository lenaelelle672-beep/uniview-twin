import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { subscribeLabelWindowOpen } from './shadowBake'

/**
 * 室内第一帧已经画完才挂房间标签。
 * useFrame 优先级 1000 排在主场景绘制之后，setState 要等这一帧结束才提交，
 * 所以飞入/室内第一绘不含标签。标签自己的停稳、合批、淡入不在这里等。
 */
export function useAfterInteriorPaint(floorId: string): boolean {
  const [shownFor, setShownFor] = useState<string | null>(null)
  const armed = useRef<string | null>(null)
  useFrame(() => {
    if (armed.current === floorId) return
    armed.current = floorId
    setShownFor(floorId)
  }, 1000)
  return shownFor === floorId
}

/**
 * 吊顶、圆标、人物、工位闪烁等到出齐 + 1s。
 * 只订阅关窗，不挡住标签出齐，也不等阴影烘完。
 */
export function useAfterLabelWindow(floorId: string): boolean {
  const [openFor, setOpenFor] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    const unsubscribe = subscribeLabelWindowOpen(() => {
      if (!cancelled) setOpenFor(floorId)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [floorId])
  return openFor === floorId
}
