import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedMesh, Material, Object3D, BufferGeometry } from 'three'
import { chairMaterial, deskMaterial, monitorMaterial } from './materials'
import type { Slot } from './layout'
import { deskChairGeometry, deskGeometry, monitorGeometry } from './geometry'

const dummy = new Object3D()

export function InstancedSlots({
  name,
  geometry,
  material,
  slots,
  colors,
  castShadow = true,
}: {
  name: string
  geometry: BufferGeometry
  material: Material
  slots: Slot[]
  colors?: Color[]
  castShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || slots.length === 0) return
    slots.forEach((slot, index) => {
      dummy.position.set(slot.x, 0, slot.z)
      dummy.rotation.set(0, slot.rot, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      if (colors) mesh.setColorAt(index, colors[index] ?? colors[0])
    })
    mesh.count = slots.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [colors, slots])

  if (slots.length === 0) return null
  return (
    <instancedMesh
      key={slots.length}
      name={name}
      ref={ref}
      args={[geometry, material, slots.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
    />
  )
}

export function Workstations({ slots, colors }: { slots: Slot[]; colors: Color[] }) {
  return (
    <group name="Workstations">
      <InstancedSlots name="WorkstationDesks" geometry={deskGeometry} material={deskMaterial} slots={slots} />
      <InstancedSlots name="WorkstationChairs" geometry={deskChairGeometry} material={chairMaterial} slots={slots} />
      <InstancedSlots
        name="WorkstationMonitors"
        geometry={monitorGeometry}
        material={monitorMaterial}
        slots={slots}
        colors={colors}
      />
    </group>
  )
}
