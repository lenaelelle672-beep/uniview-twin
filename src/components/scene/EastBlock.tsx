import { useMemo } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { extrudeUp } from '../../scene/extrude'
import { FOOTPRINT } from '../../scene/siteGeometry'
import { eastGrilleMount, eastLowerOutline, eastUpperOutline, EAST_LOWER_TOP_M, EAST_ROOF_M, outset } from '../../scene/massing'
import { baseMaterial, curtainMaterial, finMaterial, solidMaterial } from '../../scene/materials'
import { floorViewCastsExteriorShadow } from '../../scene/stage/cut'
import { useTwinStore } from '../../store/store'
import { FinRow } from './Fins'

const LOWER_TOP = EAST_LOWER_TOP_M

export function EastBlock({ model }: { model: boolean }) {
  const exteriorShadow = useTwinStore((state) => floorViewCastsExteriorShadow(state.view))
  const upperOutline = useMemo(() => eastUpperOutline(), [])
  const lowerOutline = useMemo(() => eastLowerOutline(), [])
  const upper = useMemo(() => {
    const geometry = extrudeUp(upperOutline, EAST_ROOF_M - LOWER_TOP)
    geometry.clearGroups()
    return geometry
  }, [upperOutline])
  const lower = useMemo(() => extrudeUp(lowerOutline, LOWER_TOP), [lowerOutline])
  const curve = useMemo(() => upperOutline.slice(1), [upperOutline])
  const focus = useMemo<[number, number]>(
    () => [(FOOTPRINT.minX + FOOTPRINT.maxX) / 2, (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2],
    [],
  )
  const seams = useMemo(() => {
    const span = EAST_ROOF_M - LOWER_TOP
    const levels = [0, 1, 2, 3, 4, 5].map((index) => LOWER_TOP + (span * index) / 6)
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
      <mesh geometry={lower} material={[solidMaterial, base]} castShadow={exteriorShadow} receiveShadow />
      <mesh geometry={upper} material={glass} position={[0, LOWER_TOP, 0]} castShadow={exteriorShadow} receiveShadow />
      <mesh geometry={seams} material={finMaterial} castShadow={exteriorShadow} />
      <FinRow
        points={curve}
        spacing={1.6}
        y={LOWER_TOP + (EAST_ROOF_M - LOWER_TOP) / 2}
        height={EAST_ROOF_M - LOWER_TOP - 0.15}
        outwardFrom={focus}
        castShadow={exteriorShadow}
      />
    </group>
  )
}
