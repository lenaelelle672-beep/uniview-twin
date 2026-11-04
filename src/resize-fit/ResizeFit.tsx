import { Resize } from '@react-three/drei/core/Resize'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useState } from 'react'
import { deskAnchor } from './place'
import { RESIZE_CARRIER_COLOR, RESIZE_CARRIER_M, carrierPosition, perspectiveFitMeters, type Vec3 } from './plan'
import { noteResizeCarrier } from './probe'

/** 拾取穿过载体，点选仍落到工位。 */
function ignoreCarrierPick() {
  // 不往 intersects 里推。
}

/**
 * 本地盒子交给 drei Resize，避免 setFromObject 把父组的视口缩放再量进去。
 * 最长边是 1.4，Resize 收成 1，父组 scale 就是视口上的世界长度。
 */
const CARRIER_BOX = {
  min: { x: -RESIZE_CARRIER_M.x / 2, y: -RESIZE_CARRIER_M.y / 2, z: -RESIZE_CARRIER_M.z / 2 },
  max: { x: RESIZE_CARRIER_M.x / 2, y: RESIZE_CARRIER_M.y / 2, z: RESIZE_CARRIER_M.z / 2 },
}

/**
 * T117：drei Resize 包住演示载体。不套标注，也不包工位实例。
 * Resize 把载体最长边收成 1。父组 scale 是视口较短边的一段世界长度，物体因此在原地变大。
 * 父组是我们自己的 group。实例矩阵和爆炸组的 scale 都不写。
 * 不注册逐帧回调。镜头飞走之后不跟着重算，避免 demand 停住后又被续上。
 */
export function ResizeFit({ floorId, deskId, nonce }: { floorId: string; deskId: string; nonce: string }) {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const [pose, setPose] = useState<{ center: Vec3; meters: number } | null>(null)

  useLayoutEffect(() => {
    const anchor = deskAnchor(scene, floorId, deskId)
    const center = anchor ? carrierPosition(anchor) : null
    const meters = center ? perspectiveFitMeters(camera, center) : null
    const next = center && meters != null ? { center, meters } : null
    setPose(next)
    noteResizeCarrier(next != null, next?.meters ?? null)
    if (next) invalidate()
    return () => {
      noteResizeCarrier(false, null)
      invalidate()
    }
  }, [camera, deskId, floorId, invalidate, nonce, scene])

  useLayoutEffect(() => {
    if (!pose) return
    invalidate()
  }, [invalidate, pose])

  if (!pose) return null

  return (
    <group name="ResizeFitCarrier" position={[pose.center.x, pose.center.y, pose.center.z]} scale={pose.meters}>
      <Resize box3={CARRIER_BOX as never} precise={false}>
        <mesh raycast={ignoreCarrierPick} frustumCulled={false}>
          <boxGeometry args={[RESIZE_CARRIER_M.x, RESIZE_CARRIER_M.y, RESIZE_CARRIER_M.z]} />
          <meshBasicMaterial color={RESIZE_CARRIER_COLOR} transparent opacity={0.45} depthWrite={false} fog={false} />
        </mesh>
      </Resize>
    </group>
  )
}
