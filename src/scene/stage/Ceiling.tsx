import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Mesh, Vector3 } from 'three'
import { ceilingMaterial } from './materials'

const world = new Vector3()
const forward = new Vector3()

/** 俯视时藏起吊顶，从室内抬头仍能看见。 */
export function Ceiling({
  width,
  depth,
  y,
  x = 0,
  z = 0,
}: {
  width: number
  depth: number
  y: number
  x?: number
  z?: number
}) {
  const ref = useRef<Mesh>(null)

  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    mesh.getWorldPosition(world)
    camera.getWorldDirection(forward)
    const above = camera.position.y > world.y - 0.2
    const lookingDown = forward.y < -0.12
    mesh.visible = !(above && lookingDown)
  })

  return (
    <mesh ref={ref} name="FloorCeiling" position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} material={ceilingMaterial}>
      <planeGeometry args={[width, depth]} />
    </mesh>
  )
}
