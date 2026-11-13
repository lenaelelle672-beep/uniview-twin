import { createElement, Fragment, type ReactNode } from 'react'

function tourNode(read: () => ReactNode | null | undefined): ReactNode | null {
  if (typeof window === 'undefined') return null
  return read() ?? null
}

/**
 * 格网槽在刷新时把沿轨镜头和巡游体并进去。
 * 两边都没有时原样返回，不多包一层。
 */
export function withTourMotion(overlay: ReactNode): ReactNode {
  const motion = tourNode(() => window.__twinTourMotionNode ?? null)
  const patrol = tourNode(() => window.__twinCurvePatrolNode ?? null)
  if (motion == null && patrol == null) return overlay
  const parts = [overlay, motion, patrol].filter((node) => node != null)
  if (parts.length === 1) return parts[0] ?? null
  return createElement(Fragment, null, ...parts)
}
