import { RESIZE_FIT_FILL, RESIZE_FIT_LAYERS, type ResizeFitState } from './plan'

/** 开关分包和载体分包各带一份，状态只放在 window 上。 */
export function publishResizeFit(next: {
  switchOn: boolean
  on: boolean
  mounted: boolean
  state: ResizeFitState
  deskId: string | null
  floorId: string | null
  meters: number | null
}): void {
  window.__twinResizeFit = {
    ...next,
    fill: RESIZE_FIT_FILL,
    impl: 'drei-Resize',
    html: false,
    writesInstanceMatrix: false,
    layers: RESIZE_FIT_LAYERS,
  }
}

/** 载体挂上或卸下时只改 mounted / meters，不覆盖开关和让位原因。 */
export function noteResizeCarrier(mounted: boolean, meters: number | null): void {
  const prev = window.__twinResizeFit
  if (!prev) return
  if (prev.mounted === mounted && prev.meters === meters) return
  window.__twinResizeFit = { ...prev, mounted, meters }
}
