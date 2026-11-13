import { CABLE_RUNS, CABLE_RUN_CAP, CABLE_TRAY_LAYERS, type CableTrayState } from './plan'

/**
 * 开关分包和管子分包各写一份。状态只放在 window 上。
 * segments 是目录，不是当前画出来的顶点数。count 才是挂上的网格数。
 */
export function publishCableTray(patch: {
  on: boolean
  mounted: boolean
  state: CableTrayState
  floorId: string | null
  count: number
}): void {
  if (typeof window === 'undefined') return
  window.__twinCableTray = {
    on: patch.on,
    mounted: patch.mounted,
    state: patch.state,
    floorId: patch.floorId,
    count: patch.count,
    cap: CABLE_RUN_CAP,
    impl: 'drei-Tube',
    module: 'drei-shapes',
    useFrame: false,
    argsOnce: true,
    replacesInstanced: false,
    writesInstanceMatrix: false,
    cdn: false,
    layers: CABLE_TRAY_LAYERS,
    segments: CABLE_RUNS.map((run) => ({
      id: run.id,
      tubularSegments: run.tubularSegments,
      radialSegments: run.radialSegments,
      points: run.points.length,
    })),
  }
}

/** 管子分包只改挂载，不把开关状态写成关。 */
export function noteCableMounted(mounted: boolean): void {
  if (typeof window === 'undefined') return
  const prev = window.__twinCableTray
  if (!prev) return
  window.__twinCableTray = {
    ...prev,
    mounted,
    count: mounted ? CABLE_RUNS.length : 0,
  }
}
