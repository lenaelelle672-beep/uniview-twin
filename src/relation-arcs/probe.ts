import {
  RELATION_ARC_CAP,
  RELATION_ARC_SEPARATE,
  RELATION_LINE_WIDTH,
  RELATION_SEGMENTS,
  type RelationArcState,
} from './plan'

/**
 * 开关分包和弧分包各写一份。状态只放在 window 上。
 * count 是当前挂上的弧数。cap 是硬顶，不是当前层的告警台数。
 */
export function publishRelationArcs(patch: {
  switchOn: boolean
  on: boolean
  mounted: boolean
  state: RelationArcState
  floorId: string | null
  count: number
  quadratic: number
  cubic: number
}): void {
  if (typeof window === 'undefined') return
  window.__twinRelationArcs = {
    switchOn: patch.switchOn,
    on: patch.on,
    mounted: patch.mounted,
    state: patch.state,
    floorId: patch.floorId,
    count: patch.count,
    cap: RELATION_ARC_CAP,
    quadratic: patch.quadratic,
    cubic: patch.cubic,
    lineWidth: RELATION_LINE_WIDTH,
    segments: RELATION_SEGMENTS,
    impl: 'drei-CubicBezierLine+QuadraticBezierLine',
    modules: ['CubicBezierLine', 'QuadraticBezierLine', 'Line'] as const,
    useFrame: false,
    mutatesPoints: false,
    replacesTourPath: false,
    replacesMeasure: false,
    replacesWalkPaths: false,
    replacesRoomLabels: false,
    replacesBatchSegments: false,
    cdn: false,
    separate: RELATION_ARC_SEPARATE,
  }
}

/** 弧分包只改挂载和条数，不把开关写成关。 */
export function noteRelationMounted(arcs: readonly { kind: 'quadratic' | 'cubic' }[]): void {
  if (typeof window === 'undefined') return
  const prev = window.__twinRelationArcs
  if (!prev) return
  if (!prev.on && arcs.length === 0) return
  let quadratic = 0
  let cubic = 0
  for (const arc of arcs) {
    if (arc.kind === 'quadratic') quadratic += 1
    else cubic += 1
  }
  window.__twinRelationArcs = {
    ...prev,
    mounted: arcs.length > 0,
    count: arcs.length,
    quadratic,
    cubic,
  }
}
