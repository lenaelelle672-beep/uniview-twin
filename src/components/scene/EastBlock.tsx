import { useMemo } from 'react'
import { extrudeUp } from '../../scene/extrude'
import { FOOTPRINT } from '../../scene/siteGeometry'
import { eastGrilleMount, eastUpperOutline, EAST_ROOF_M } from '../../scene/massing'
import { solidMaterial } from '../../scene/materials'
import { FinRow } from './Fins'

export function EastBlock({ model }: { model: boolean }) {
  const outline = useMemo(() => eastUpperOutline(), [])
  const shell = useMemo(() => {
    const geometry = extrudeUp(outline, EAST_ROOF_M)
    geometry.clearGroups()
    return geometry
  }, [outline])
  const southEdge = useMemo(
    () =>
      [
        [FOOTPRINT.minX, FOOTPRINT.maxZ],
        [FOOTPRINT.maxX, FOOTPRINT.maxZ],
      ] as Array<[number, number]>,
    [],
  )
  const grille = eastGrilleMount()
  const material = model ? solidMaterial : solidMaterial

  return (
    <group name="EastBlock">
      <object3D name="eastGrilleMount" position={grille.position} rotation={grille.rotation} />
      <mesh geometry={shell} material={material} castShadow receiveShadow />
      <FinRow
        points={southEdge}
        spacing={1.6}
        y={EAST_ROOF_M / 2}
        height={EAST_ROOF_M - 0.2}
        outwardFrom={[(FOOTPRINT.minX + FOOTPRINT.maxX) / 2, (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2]}
      />
    </group>
  )
}
