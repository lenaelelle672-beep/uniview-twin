import { useMemo } from 'react'
import { BoxGeometry } from 'three'
import { extrudeUp } from '../../scene/extrude'
import { ellipsePoints } from '../../scene/massing'
import { highlightJointMaterial, solidMaterial, stoneMaterial, zoneMaterials } from '../../scene/materials'
import { COURTYARD, FOOTPRINT, footprintOutline, TOWER } from '../../scene/siteGeometry'
import { useTwinStore } from '../../store/store'
import { useFloorActions } from './floorPick'

export function B1({ model }: { model: boolean }) {
  const selected = useTwinStore((state) => state.selectedFloor === 'B1')
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
  const eastCenter: [number, number] = [(FOOTPRINT.minX + FOOTPRINT.maxX) / 2, (FOOTPRINT.minZ + FOOTPRINT.maxZ) / 2]
  const atrium = useMemo(
    () => extrudeUp(ellipsePoints(COURTYARD.cx, COURTYARD.cz, COURTYARD.rx - 0.4, COURTYARD.rz - 0.35, 28), 0.12),
    [],
  )
  const rooms = useMemo(() => {
    const geometry = new BoxGeometry(4.2, 0.16, 5.2)
    return geometry
  }, [])
  const fan = useMemo(() => {
    const points: Array<[number, number]> = [[28, 18]]
    for (let i = 0; i <= 14; i += 1) {
      const t = -0.4 + (2.2 * i) / 14
      points.push([28 + Math.cos(t) * 16, 18 + Math.sin(t) * 14])
    }
    return extrudeUp(points, 0.12)
  }, [])

  const slabMaterial = selected ? highlightJointMaterial : model ? solidMaterial : stoneMaterial

  return (
    <group name="B1" position={[0, -5.5, 0]} {...actions}>
      <mesh geometry={slab} material={slabMaterial} receiveShadow />
      <mesh geometry={towerSlab} material={slabMaterial} receiveShadow />
      {!model && (
        <>
          <mesh geometry={atrium} material={zoneMaterials[1]} position={[0, 0.28, 0]} />
          <mesh position={[0, 0.36, -2]} material={zoneMaterials[0]}>
            <boxGeometry args={[18, 0.16, 14]} />
          </mesh>
          <mesh geometry={fan} material={zoneMaterials[2]} position={[0, 0.28, 0]} />
          <mesh position={[eastCenter[0], 0.36, eastCenter[1] - 6]} material={zoneMaterials[3]}>
            <boxGeometry args={[28, 0.16, 16]} />
          </mesh>
          <mesh position={[eastCenter[0] + 8, 0.36, eastCenter[1] + 10]} material={zoneMaterials[4]}>
            <boxGeometry args={[16, 0.16, 12]} />
          </mesh>
          {Array.from({ length: 5 }, (_, index) => (
            <mesh key={index} geometry={rooms} material={zoneMaterials[5]} position={[-24 + index * 5.2, 0.36, TOWER.maxZ - 4]} />
          ))}
        </>
      )}
    </group>
  )
}
