import {
  RADIAL_SHADOW_CAP,
  RADIAL_SHADOW_COLOR_STOP,
  RADIAL_SHADOW_LAYERS,
  RADIAL_SHADOW_LIFT,
  RADIAL_SHADOW_OPACITY,
  RADIAL_SHADOW_POLYGON_OFFSET,
  RADIAL_SHADOW_SCALE,
  type RadialShadowState,
} from './plan'

/** 开关分包和圆斑分包各写一份，状态只放在 window 上。 */
export function publishRadialShadow(next: {
  switchOn: boolean
  on: boolean
  mounted: boolean
  state: RadialShadowState
  floorId: string | null
  count: number
  deskIds: readonly string[]
}): void {
  window.__twinRadialShadow = {
    switchOn: next.switchOn,
    on: next.on,
    mounted: next.mounted,
    state: next.state,
    floorId: next.floorId,
    count: next.count,
    cap: RADIAL_SHADOW_CAP,
    deskIds: [...next.deskIds],
    scale: RADIAL_SHADOW_SCALE,
    opacity: RADIAL_SHADOW_OPACITY,
    colorStop: RADIAL_SHADOW_COLOR_STOP,
    lift: RADIAL_SHADOW_LIFT,
    polygonOffset: RADIAL_SHADOW_POLYGON_OFFSET,
    impl: 'drei-Shadow',
    modules: ['Shadow'],
    replacesContactShadows: false,
    replacesSoftShadows: false,
    balancedFx: false,
    useFrame: false,
    writesInstanceMatrix: false,
    layers: RADIAL_SHADOW_LAYERS,
    cdn: false,
  }
}

/** 圆斑挂上或卸下时只改 mounted / count，不覆盖开关和让位原因。 */
export function noteRadialShadow(count: number): void {
  const prev = window.__twinRadialShadow
  if (!prev) return
  const mounted = count > 0
  if (prev.mounted === mounted && prev.count === count) return
  window.__twinRadialShadow = { ...prev, mounted, count }
}
