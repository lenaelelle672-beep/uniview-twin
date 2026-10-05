import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { extrudeUp } from '../../scene/extrude'
import {
  eastFloorBandLevels,
  eastGrilleMount,
  eastLowerOutline,
  eastUpperOutline,
  eastWestArc,
  EAST_LOWER_TOP_M,
  EAST_ROOF_M,
  outset,
} from '../../scene/massing'
import { northWingTopM } from '../../data/levels'
import { NORTH_WING_OUTLINE } from '../../scene/shell/rings'
import { FOOTPRINT } from '../../scene/siteGeometry'
import { baseMaterial, curtainMaterial, finMaterial, solidMaterial } from '../../scene/materials'
import type { QualityTier } from '../../types'
import { EastGrille } from './EastGrille'
import { FinRow } from './Fins'

const LOWER_TOP = EAST_LOWER_TOP_M

export function EastBlock({ model, quality }: { model: boolean; quality: QualityTier }) {
  const upperOutline = useMemo(() => eastUpperOutline(), [])
  const lowerOutline = useMemo(() => eastLowerOutline(), [])
  const upper = useMemo(() => {
    const east = extrudeUp(upperOutline, EAST_ROOF_M - LOWER_TOP)
    east.clearGroups()
    const wingTop = northWingTopM()
    if (wingTop <= LOWER_TOP) {
      east.translate(0, LOWER_TOP, 0)
      return east
    }
    const wing = extrudeUp(NORTH_WING_OUTLINE, wingTop - LOWER_TOP)
    wing.clearGroups()
    wing.translate(0, LOWER_TOP, 0)
    east.translate(0, LOWER_TOP, 0)
    const merged = mergeGeometries([east, wing])
    east.dispose()
    wing.dispose()
    if (!merged) throw new Error('东楼上部为空')
    return merged
  }, [upperOutline])
  const lower = useMemo(() => {
    const east = extrudeUp(lowerOutline, LOWER_TOP)
    const wing = extrudeUp(NORTH_WING_OUTLINE, Math.min(LOWER_TOP, northWingTopM()))
    const merged = mergeGeometries([east, wing])
    east.dispose()
    wing.dispose()
    if (!merged) throw new Error('东楼下层为空')
    return merged
  }, [lowerOutline])
  const curve = useMemo(() => eastWestArc(), [])
  const focus = useMemo<[number, number]>(
    () => [(FOOTPRINT.minX + FOOTPRINT.maxX) / 2, (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2],
    [],
  )
  const seams = useMemo(() => {
    const levels = [...eastFloorBandLevels(), EAST_ROOF_M]
    const parts = levels.map((level) => {
      const geometry = extrudeUp(outset(upperOutline, 0.12, focus), 0.2)
      geometry.translate(0, level, 0)
      return geometry
    })
    const merged = mergeGeometries(parts)
    parts.forEach((geometry) => geometry.dispose())
    if (!merged) throw new Error('东楼分层线为空')
    return merged
  }, [focus, upperOutline])
  const glass = model ? solidMaterial : curtainMaterial
  const base = model ? solidMaterial : baseMaterial
  const grille = eastGrilleMount()

  return (
    <group name="EastBlock">
      <object3D name="eastGrilleMount" position={grille.position} rotation={grille.rotation} />
      <mesh geometry={lower} material={[solidMaterial, base]} castShadow receiveShadow />
      <mesh geometry={upper} material={glass} castShadow receiveShadow />
      <mesh geometry={seams} material={finMaterial} castShadow />
      <FinRow
        points={curve}
        spacing={1.6}
        y={LOWER_TOP + (EAST_ROOF_M - LOWER_TOP) / 2}
        height={EAST_ROOF_M - LOWER_TOP - 0.15}
        outwardFrom={focus}
      />
      {!model && <EastGrille quality={quality} />}
    </group>
  )
}
