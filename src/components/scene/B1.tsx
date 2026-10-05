import { useMemo } from 'react'
import { buildB1ZoneGeometry, zoneBlockMaterial } from '../../scene/b1Zones'
import { extrudeUp } from '../../scene/extrude'
import { highlightJointMaterial, solidMaterial, stoneMaterial } from '../../scene/materials'
import { b1SlabOutline } from '../../scene/stage/b1Plan'
import { isBasementSlabHidden, isBasementZonesHidden } from '../../scene/stage/cut'
import { useTwinStore } from '../../store/store'
import { BUILDING_HIGHLIGHT_ORDER } from '../../scene/overlayOrder'
import { useFloorActions } from './floorPick'

export function B1({ model }: { model: boolean }) {
  const selected = useTwinStore((state) => state.view === 'building' && state.selectedFloor === 'B1')
  const actions = useFloorActions('B1')
  const hideSlab = useTwinStore((state) => isBasementSlabHidden(state.view, state.selectedFloor))
  const hideZones = useTwinStore((state) => isBasementZonesHidden(state.view, state.selectedFloor))
  const slab = useMemo(() => extrudeUp(b1SlabOutline(), 0.28), [])
  const zones = useMemo(() => buildB1ZoneGeometry(), [])
  const slabMaterial = selected ? highlightJointMaterial : model ? solidMaterial : stoneMaterial

  return (
    <group name="B1" position={[0, -5.5, 0]} {...actions}>
      <mesh
        name="B1Slab"
        geometry={slab}
        material={slabMaterial}
        receiveShadow
        visible={!hideSlab}
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
      {!model && <mesh name="B1Zones" geometry={zones} material={zoneBlockMaterial} visible={!hideZones} />}
    </group>
  )
}
