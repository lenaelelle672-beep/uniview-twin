import {
  ROUNDED_BOX_LAYERS,
  ROUNDED_CARRIER_CAP,
  ROUNDED_CARRIERS,
  carrierKindCounts,
  type RoundedBoxState,
} from './plan'

/**
 * 开关分包和载体分包各写一份。状态只放在 window 上。
 * kinds 是目录，不是当前画出来的只数。count 才是挂上的网格数。
 */
export function publishRoundedBox(patch: {
  on: boolean
  mounted: boolean
  state: RoundedBoxState
  floorId: string | null
  count: number
}): void {
  if (typeof window === 'undefined') return
  window.__twinRoundedBox = {
    on: patch.on,
    mounted: patch.mounted,
    state: patch.state,
    floorId: patch.floorId,
    count: patch.count,
    cap: ROUNDED_CARRIER_CAP,
    kinds: carrierKindCounts(),
    anchor: 'workstation-0',
    impl: 'drei-RoundedBox',
    creasedNormals: 'three-stdlib',
    replacesInstanced: false,
    writesInstanceMatrix: false,
    cdn: false,
    layers: ROUNDED_BOX_LAYERS,
  }
}

/** 载体分包只改挂载，不把开关状态写成关。 */
export function noteRoundedMounted(mounted: boolean): void {
  if (typeof window === 'undefined') return
  const prev = window.__twinRoundedBox
  if (!prev) return
  window.__twinRoundedBox = {
    ...prev,
    mounted,
    count: mounted ? ROUNDED_CARRIERS.length : 0,
  }
}
