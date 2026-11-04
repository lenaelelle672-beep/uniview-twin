import {
  SCREEN_MARK_ANCHOR,
  SCREEN_MARK_BOUNDS,
  SCREEN_MARK_DEPTH,
  SCREEN_MARK_LABEL,
  SCREEN_MARK_MAX,
  SCREEN_MARK_ORDER,
  type ScreenMarkPlacementReason,
  type ScreenMarkState,
} from './plan'

export interface ScreenMarkPublish {
  on: boolean
  mounted: boolean
  state: ScreenMarkState
  placement: ScreenMarkPlacementReason | 'hidden'
  x: number
  y: number
}

/** 开关分包和标注分包各带一份，状态只放在 window 上。 */
export function publishScreenMark(next: ScreenMarkPublish): void {
  const prev = window.__twinScreenMark
  if (
    prev &&
    prev.on === next.on &&
    prev.mounted === next.mounted &&
    prev.state === next.state &&
    prev.placement === next.placement &&
    Math.abs(prev.x - next.x) < 1e-3 &&
    Math.abs(prev.y - next.y) < 1e-3
  ) {
    return
  }
  const count = next.mounted && next.placement === 'in' ? 1 : 0
  window.__twinScreenMark = {
    on: next.on,
    mounted: next.mounted,
    state: next.state,
    placement: next.placement,
    x: next.x,
    y: next.y,
    count,
    max: SCREEN_MARK_MAX,
    impl: 'drei-ScreenSpace',
    anchor: SCREEN_MARK_ANCHOR,
    depth: SCREEN_MARK_DEPTH,
    order: SCREEN_MARK_ORDER,
    label: SCREEN_MARK_LABEL,
    bounds: SCREEN_MARK_BOUNDS,
    domHud: 'untouched',
    screenSizer: 'forbidden',
    cdn: false,
  }
}
