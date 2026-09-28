import { useMemo } from 'react'
import { buildB1ZoneGeometry, zoneBlockMaterial } from '../../scene/b1Zones'
import { extrudeUp } from '../../scene/extrude'
import { solidMaterial, stoneMaterial } from '../../scene/materials'
import { b1SlabOutline } from '../../scene/stage/b1Plan'
import { isBasementSlabHidden } from '../../scene/stage/cut'
import { useTwinStore } from '../../store/store'

export function B1({ model }: { model: boolean }) {
  const enterFloor = useTwinStore((state) => state.enterFloor)
  const hideSlab = useTwinStore((state) => isBasementSlabHidden(state.view, state.selectedFloor))
  const slab = useMemo(() => extrudeUp(b1SlabOutline(), 0.28), [])
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
      {!model && <mesh name="B1Zones" geometry={zones} material={zoneBlockMaterial} />}
    </group>
  )
}
