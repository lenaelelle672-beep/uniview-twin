import { useEffect, useRef } from 'react'
import { canvasContainer, watchCanvasOffscreen } from '../../scene/offscreenPause'

/**
 * T067：观察画布容器。滚出视口时 onPause，重新进入时 onResume。
 * 回调放进 ref，避免 DemandLoop 每次渲染都拆掉观察器，和正在走的 hz 定时器抢 wake。
 * 本模块只从 DemandLoop 引用。DemandLoop 在首帧 2600ms 之后才挂，不进 hardGate。
 */
export function useOffscreenPause(canvas: HTMLCanvasElement, onPause: () => void, onResume: () => void): void {
  const pauseRef = useRef(onPause)
  const resumeRef = useRef(onResume)
  pauseRef.current = onPause
  resumeRef.current = onResume

  useEffect(() => {
    return watchCanvasOffscreen(canvasContainer(canvas), {
      onPause: () => pauseRef.current(),
      onResume: () => resumeRef.current(),
    })
  }, [canvas])
}
