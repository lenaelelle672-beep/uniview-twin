import { useMemo } from 'react'
import { buildB1ZoneGeometry, zoneBlockMaterial } from '../../scene/b1Zones'
import { extrudeUp } from '../../scene/extrude'
import { highlightJointMaterial, solidMaterial, stoneMaterial } from '../../scene/materials'
import { footprintOutline, TOWER } from '../../scene/siteGeometry'
import { useTwinStore } from '../../store/store'
import { BUILDING_HIGHLIGHT_ORDER } from '../../scene/overlayOrder'
import { useFloorActions } from './floorPick'

export function B1({ model }: { model: boolean }) {
  const selected = useTwinStore((state) => state.view === 'building' && state.selectedFloor === 'B1')
  const actions = useFloorActions('B1')
  const slab = useMemo(() => extrudeUp(footprintOutline(), 0.28), [])
  const towerSlab = useMemo(
    () =>
      extrudeUp(
        [
          [TOWER.minX, TOWER.minZ],
          [TOWER.maxX, TOWER.minZ],
          [TOWER.maxX, TOWER.maxZ],
          [TOWER.minX, TOWER.maxZ],
        ],
        0.28,
      ),
    [],
  )
  const zones = useMemo(() => buildB1ZoneGeometry(), [])
  const slabMaterial = selected ? highlightJointMaterial : model ? solidMaterial : stoneMaterial

  return (
    <group name="B1" position={[0, -5.5, 0]} {...actions}>
      <mesh
        name="B1Slab"
        geometry={slab}
        material={slabMaterial}
        receiveShadow
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
      <mesh
        name="B1TowerSlab"
        geometry={towerSlab}
        material={slabMaterial}
        receiveShadow
        renderOrder={selected ? BUILDING_HIGHLIGHT_ORDER : 0}
      />
      {!model && <mesh name="B1Zones" geometry={zones} material={zoneBlockMaterial} />}
    </group>
  )
}
