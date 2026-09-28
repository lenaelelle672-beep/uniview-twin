import { useMemo } from 'react'
import { buildB1ZoneGeometry, zoneBlockMaterial } from '../../scene/b1Zones'
import { extrudeUp } from '../../scene/extrude'
import { solidMaterial, stoneMaterial } from '../../scene/materials'
import { isBasementSlabHidden } from '../../scene/stage/cut'
import { footprintOutline, TOWER } from '../../scene/siteGeometry'
import { useTwinStore } from '../../store/store'

export function B1({ model }: { model: boolean }) {
  const enterFloor = useTwinStore((state) => state.enterFloor)
  const hideSlab = useTwinStore((state) => isBasementSlabHidden(state.view, state.selectedFloor))
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

  return (
    <group
      name="B1"
      position={[0, -5.5, 0]}
      onDoubleClick={(event) => {
        event.stopPropagation()
        enterFloor('B1')
      }}
    >
      <mesh name="B1Slab" geometry={slab} material={model ? solidMaterial : stoneMaterial} receiveShadow visible={!hideSlab} />
      <mesh
        name="B1TowerSlab"
        geometry={towerSlab}
        material={model ? solidMaterial : stoneMaterial}
        receiveShadow
        visible={!hideSlab}
      />
      {!model && <mesh name="B1Zones" geometry={zones} material={zoneBlockMaterial} />}
    </group>
  )
}
