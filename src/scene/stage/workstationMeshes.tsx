import type { Color } from 'three'
import { ALARM_MARKER_ORDER, MONITOR_LAYER } from '../overlayOrder'
import { chairMaterial, deskMaterial, monitorMaterial } from './materials'
import type { Slot } from './layout'
import { deskChairGeometry, deskGeometry, monitorGeometry } from './geometry'
import { InstancedSlots } from './instancedSlots'

/** 真实工位。父级 Suspense 未就绪时不挂，楼板和外壳先留在外面。 */
export function WorkstationMeshes({ slots, colors }: { slots: Slot[]; colors: Color[] }) {
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
