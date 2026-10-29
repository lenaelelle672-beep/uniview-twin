import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedMesh, Material, Object3D, BufferGeometry } from 'three'
import { commitInstanceMatrices, markInstanceMatrixDynamic, stepInstanceMesh } from '../instanceMatrix'
import { MONITOR_DISPLAY_COLOR } from './materials'
import type { Slot } from './layout'

const dummy = new Object3D()

/**
 * 空数组也是 truthy。`colors[index] ?? colors[0]` 会把 undefined 交给 setColorAt，three 再读 toArray。
 * 没传颜色（桌、椅）保持不写。空表落到离线色，这次 setColorAt 会建好 instanceColor。
 */
export function instanceColorAt(colors: Color[] | undefined, index: number): Color | null {
  if (!colors) return null
  if (colors.length === 0) return MONITOR_DISPLAY_COLOR.offline
  return colors[index] ?? colors[0] ?? null
}

export function InstancedSlots({
  name,
  geometry,
  material,
  slots,
  colors,
  castShadow = true,
  renderOrder = 0,
  layer,
}: {
  name: string
  geometry: BufferGeometry
  material: Material
  slots: Slot[]
  colors?: Color[]
  castShadow?: boolean
  renderOrder?: number
  layer?: number
}) {
  const ref = useRef<InstancedMesh>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || slots.length === 0) return
    markInstanceMatrixDynamic(mesh)
    slots.forEach((slot, index) => {
      dummy.position.set(slot.x, 0, slot.z)
      dummy.rotation.set(0, slot.rot, 0)
      dummy.scale.set(slot.sx ?? 1, slot.sy ?? 1, slot.sz ?? 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      const color = instanceColorAt(colors, index)
      if (color) mesh.setColorAt(index, color)
    })
    mesh.count = slots.length
    commitInstanceMatrices(mesh, mesh.instanceColor != null)
    mesh.computeBoundingSphere()
    if (layer != null) mesh.layers.set(layer)
  }, [colors, layer, slots])

  useFrame(() => {
    const mesh = ref.current
    if (mesh) stepInstanceMesh(mesh, invalidate)
  })

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
      renderOrder={renderOrder}
    />
  )
}
