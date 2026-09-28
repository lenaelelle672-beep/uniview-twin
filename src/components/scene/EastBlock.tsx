import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FLOOR_HEIGHT_F1_M, FLOOR_HEIGHT_TYPICAL_M } from '../../data/floors'
import { extrudeUp } from '../../scene/extrude'
import { eastLowerOutline, eastUpperOutline, EAST_ROOF_M, outset } from '../../scene/massing'
import { curtainMaterial, finMaterial, solidMaterial } from '../../scene/materials'
import { FinRow } from './Fins'

const LOWER_TOP = FLOOR_HEIGHT_F1_M + FLOOR_HEIGHT_TYPICAL_M

export function EastBlock({ model }: { model: boolean }) {
  const upperOutline = useMemo(() => eastUpperOutline(), [])
  const lowerOutline = useMemo(() => eastLowerOutline(), [])
  const upper = useMemo(() => extrudeUp(upperOutline, EAST_ROOF_M - LOWER_TOP), [upperOutline])
  const lower = useMemo(() => extrudeUp(lowerOutline, LOWER_TOP), [lowerOutline])
  const curve = useMemo(() => upperOutline.slice(1), [upperOutline])
  const seams = useMemo(() => {
    const levels = [LOWER_TOP, LOWER_TOP + FLOOR_HEIGHT_TYPICAL_M, LOWER_TOP + FLOOR_HEIGHT_TYPICAL_M * 2]
    const parts = levels.map((level) => {
      const geometry = extrudeUp(outset(upperOutline, 0.12, [40, 12]), 0.2)
      geometry.translate(0, level, 0)
      return geometry
    })
    const merged = mergeGeometries(parts)
    parts.forEach((geometry) => geometry.dispose())
    if (!merged) throw new Error('东楼分层线为空')
    return merged
  }, [upperOutline])
  const glass = model ? solidMaterial : curtainMaterial

  return (
    <group name="EastBlock">
      <mesh geometry={lower} material={[solidMaterial, glass]} castShadow receiveShadow />
      <mesh geometry={upper} material={solidMaterial} position={[0, LOWER_TOP, 0]} castShadow receiveShadow />
      <mesh geometry={seams} material={finMaterial} castShadow />
      <FinRow
        points={curve}
        spacing={0.95}
        y={LOWER_TOP + (EAST_ROOF_M - LOWER_TOP) / 2}
        height={EAST_ROOF_M - LOWER_TOP - 0.15}
        outwardFrom={[40, 8]}
      />
    </group>
  )
}
