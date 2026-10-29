import { BoxGeometry, MeshStandardMaterial } from 'three'
import { InstancedSlots } from './instancedSlots'
import type { Slot } from './layout'

const deskBox = new BoxGeometry(1.15, 0.7, 0.55)
deskBox.translate(0, 0.35, 0)
const deskMat = new MeshStandardMaterial({ color: '#d9d3c7', roughness: 1, metalness: 0 })

/**
 * 工位内层的低模盒。外壳和场地仍在 Scene 那一层 Suspense 里。
 * 不画全屏 Loader，进度条仍是已有的 AssetLoadOverlay。
 */
export function WorkstationSkeleton({ slots }: { slots: Slot[] }) {
  if (slots.length === 0) return null
  return (
    <InstancedSlots
      name="WorkstationSkeleton"
      geometry={deskBox}
      material={deskMat}
      slots={slots}
      castShadow={false}
    />
  )
}
