import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedMesh, Material, Object3D, BufferGeometry } from 'three'
import { ALARM_MARKER_ORDER, MONITOR_LAYER } from '../overlayOrder'
import { MONITOR_DISPLAY_COLOR, chairMaterial, deskMaterial, monitorMaterial } from './materials'
import type { Slot } from './layout'
import { deskChairGeometry, deskGeometry, monitorGeometry } from './geometry'

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

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh || slots.length === 0) return
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
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    if (layer != null) mesh.layers.set(layer)
  }, [colors, layer, slots])

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
        // 告警红屏和同网格里的其他状态共用这次绘制。单独一层，合成器之后再画。
        renderOrder={ALARM_MARKER_ORDER}
        layer={MONITOR_LAYER}
      />
    </group>
  )
}
