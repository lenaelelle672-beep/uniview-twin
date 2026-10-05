import { lazy, Suspense, useMemo } from 'react'
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
import { curtainMaterial, finMaterial, solidMaterial } from '../../scene/materials'
import type { QualityTier } from '../../types'
import { FinRow } from './Fins'

const EastGrille = lazy(() => import('./EastGrille'))

const LOWER_TOP = EAST_LOWER_TOP_M

export function EastBlock({ model, quality }: { model: boolean; quality: QualityTier }) {
  const upperOutline = useMemo(() => eastUpperOutline(), [])
  const lowerOutline = useMemo(() => eastLowerOutline(), [])
  const solid = useMemo(() => {
    const upper = extrudeUp(upperOutline, EAST_ROOF_M - LOWER_TOP)
    upper.clearGroups()
    upper.translate(0, LOWER_TOP, 0)
    const lower = extrudeUp(lowerOutline, LOWER_TOP)
    lower.clearGroups()
    const merged = mergeGeometries([upper, lower])
    upper.dispose()
    lower.dispose()
    if (!merged) throw new Error('东楼实体为空')
    return merged
  }, [lowerOutline, upperOutline])
  const wing = useMemo(() => {
    const geometry = extrudeUp(NORTH_WING_OUTLINE, northWingTopM())
    geometry.clearGroups()
    return geometry
  }, [])
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
  const grille = eastGrilleMount()

  return (
    <group name="EastBlock">
      <object3D name="eastGrilleMount" position={grille.position} rotation={grille.rotation} />
      <mesh geometry={solid} material={solidMaterial} castShadow receiveShadow />
      <mesh geometry={wing} material={glass} castShadow receiveShadow />
      <mesh geometry={seams} material={finMaterial} castShadow />
      <FinRow
        points={curve}
        spacing={1.6}
        y={LOWER_TOP + (EAST_ROOF_M - LOWER_TOP) / 2}
        height={EAST_ROOF_M - LOWER_TOP - 0.15}
        outwardFrom={focus}
      />
      {!model && (
        <Suspense fallback={null}>
          <EastGrille quality={quality} />
        </Suspense>
      )}
    </group>
  )
}
