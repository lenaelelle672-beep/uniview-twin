import { createElement, Fragment, type ReactNode } from 'react'

/** 格网槽在刷新时把沿轨节点并进去。没有播放时原样返回，不多包一层。 */
export function withTourMotion(overlay: ReactNode): ReactNode {
  const motion = typeof window === 'undefined' ? null : (window.__twinTourMotionNode ?? null)
  if (motion == null) return overlay
  if (overlay == null) return motion
  return createElement(Fragment, null, overlay, motion)
}
