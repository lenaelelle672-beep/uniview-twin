import { useMemo } from 'react'
import { BoxGeometry } from 'three'
import { extrudeUp } from '../../scene/extrude'
import { ellipsePoints } from '../../scene/massing'
import { solidMaterial, stoneMaterial, zoneMaterials } from '../../scene/materials'
import { COURTYARD, footprintOutline, TOWER } from '../../scene/siteGeometry'

export function B1({ model }: { model: boolean }) {
  const slab = useMemo(() => extrudeUp(footprintOutline(), 0.28), [])
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

  return (
    <group name="B1" position={[0, -5.5, 0]}>
      <mesh geometry={slab} material={model ? solidMaterial : stoneMaterial} receiveShadow />
      {!model && (
        <>
          <mesh geometry={atrium} material={zoneMaterials[1]} position={[0, 0.28, 0]} />
          <mesh position={[0, 0.36, -2]} material={zoneMaterials[0]}>
            <boxGeometry args={[18, 0.16, 14]} />
          </mesh>
          <mesh geometry={fan} material={zoneMaterials[2]} position={[0, 0.28, 0]} />
          <mesh position={[48, 0.36, 2]} material={zoneMaterials[3]}>
            <boxGeometry args={[28, 0.16, 16]} />
          </mesh>
          <mesh position={[42, 0.36, 22]} material={zoneMaterials[4]}>
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
