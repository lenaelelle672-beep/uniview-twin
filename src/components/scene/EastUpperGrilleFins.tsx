import { useMemo } from 'react'
import {
  EAST_FACADE_CAP_BOTTOM_M,
  EAST_FACADE_FIN_BOTTOM_M,
  EAST_FACADE_FIN_DEPTH_M,
  EAST_FACADE_FIN_SPACING_M,
  eastFacadeInward,
  eastFacadeLine,
} from '../../scene/eastFacadeBands'
import { FinRow } from './Fins'

/** T140：上段密肋。由 EastGrille 在 __twinReady + 首帧 + 2600ms 之后才 import，不进 hardGate。 */
export function EastUpperGrilleFins() {
  const points = useMemo(() => eastFacadeLine(), [])
  const inward = useMemo(() => eastFacadeInward(), [])
  const y = (EAST_FACADE_FIN_BOTTOM_M + EAST_FACADE_CAP_BOTTOM_M) / 2
  const height = EAST_FACADE_CAP_BOTTOM_M - EAST_FACADE_FIN_BOTTOM_M
  return (
    <group name="EastUpperGrilleFins">
      <FinRow
        points={points}
        spacing={EAST_FACADE_FIN_SPACING_M}
        y={y}
        height={height}
        depth={EAST_FACADE_FIN_DEPTH_M}
        outwardFrom={inward}
      />
    </group>
  )
}

export default EastUpperGrilleFins
