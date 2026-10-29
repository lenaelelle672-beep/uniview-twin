import { useFrame, useThree } from '@react-three/fiber'
import type { Object3D } from 'three'
import { stepInstanceGroup } from './instanceMatrix'

/** 预烘焙工位不走 InstancedSlots，动画时从这组网格批量写矩阵。 */
export function InstanceMatrixMotion({ root }: { root: Object3D }) {
  const invalidate = useThree((state) => state.invalidate)
  useFrame(() => {
    stepInstanceGroup(root, invalidate)
  })
  return null
}
