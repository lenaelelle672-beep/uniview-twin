import { useMemo } from 'react'
import { EAST_LOWER_TOP_M, EAST_ROOF_M } from '../../scene/massing'
import {
  EAST_SOUTH_FIN_DEPTH_M,
  EAST_SOUTH_FIN_SPACING_M,
  EAST_SOUTH_FIN_THICKNESS_M,
  eastSouthFinMaterial,
  eastSouthInward,
  eastSouthUpperLine,
} from '../../scene/eastSouthFacade'
import { FinRow } from './Fins'

/** T147：南墙上段密肋。由 EastBlock 在 __twinReady + 首帧 + 2600ms + __twinPrefetchAt 之后才 import，不进 hardGate。 */
export function EastSouthFacadeFins() {
  const points = useMemo(() => eastSouthUpperLine(), [])
  const inward = useMemo(() => eastSouthInward(), [])
  const height = EAST_ROOF_M - EAST_LOWER_TOP_M - 0.15
  const y = EAST_LOWER_TOP_M + (EAST_ROOF_M - EAST_LOWER_TOP_M) / 2
  return (
    <group name="EastSouthFacadeFins">
      <FinRow
        points={points}
        spacing={EAST_SOUTH_FIN_SPACING_M}
        y={y}
        height={height}
        depth={EAST_SOUTH_FIN_DEPTH_M}
        thickness={EAST_SOUTH_FIN_THICKNESS_M}
        box
        outwardFrom={inward}
        material={eastSouthFinMaterial}
      />
    </group>
  )
}

export default EastSouthFacadeFins
