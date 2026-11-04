import { RoundedBox } from '@react-three/drei/core/RoundedBox'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useState } from 'react'
import { ROUNDED_CARRIERS, type RoundedCarrier } from './plan'
import { anchorPose, sameAnchorPose, type AnchorHost, type AnchorPose } from './pose'
import { noteRoundedMounted } from './probe'

/** 拾取穿过载体，点选仍落到工位。 */
function ignoreCarrierPick() {
  // 不往 intersects 里推。
}

function isAnchorHost(value: unknown): value is AnchorHost {
  if (!value || typeof value !== 'object') return false
  const host = value as Partial<AnchorHost>
  return (
    host.isInstancedMesh === true &&
    typeof host.count === 'number' &&
    typeof host.getMatrixAt === 'function' &&
    typeof host.updateWorldMatrix === 'function' &&
    host.matrixWorld != null
  )
}

/**
 * T122：四只 drei RoundedBox。
 * 父组抄第 0 号工位的世界矩阵，子网格留在工位局部坐标。
 * 另一组网格，不改工位实例。没有逐帧回调。
 * 矩阵没变就不 setState，demand 不会被这个定时器续上。
 */
export function RoundedCarriers() {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [pose, setPose] = useState<AnchorPose | null>(null)

  useEffect(() => {
    let stop = false
    const pull = () => {
      if (stop) return
      const found = scene.getObjectByName('WorkstationDesks')
      const next = isAnchorHost(found) ? anchorPose(found) : null
      setPose((prev) => (sameAnchorPose(prev, next) ? prev : next))
    }
    pull()
    const id = window.setInterval(pull, 200)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [scene])

  useLayoutEffect(() => {
    noteRoundedMounted(pose != null)
    if (pose) invalidate()
  }, [invalidate, pose])

  useLayoutEffect(() => {
    return () => {
      noteRoundedMounted(false)
      invalidate()
    }
  }, [invalidate])

  if (!pose) return null

  return (
    <group name="RoundedCarriers" position={pose.position} quaternion={pose.quaternion} scale={pose.scale}>
      {ROUNDED_CARRIERS.map((carrier) => (
        <Carrier key={carrier.id} carrier={carrier} />
      ))}
    </group>
  )
}

function Carrier({ carrier }: { carrier: RoundedCarrier }) {
  return (
    <RoundedBox
      name={carrier.name}
      args={[carrier.args[0], carrier.args[1], carrier.args[2]]}
      radius={carrier.radius}
      smoothness={carrier.smoothness}
      bevelSegments={carrier.bevelSegments}
      steps={carrier.steps}
      creaseAngle={carrier.creaseAngle}
      position={[carrier.position[0], carrier.position[1], carrier.position[2]]}
      raycast={ignoreCarrierPick}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={carrier.color} roughness={carrier.roughness} metalness={carrier.metalness} />
    </RoundedBox>
  )
}
