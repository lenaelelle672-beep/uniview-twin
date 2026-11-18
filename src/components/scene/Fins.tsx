import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, InstancedMesh, type Material, Object3D, PlaneGeometry } from 'three'
import { finsAlong, type FinPoint } from '../../scene/massing'
import { finMaterial } from '../../scene/materials'

export function FinRow({
  points,
  spacing,
  y,
  height,
  depth = 0.42,
  thickness = 0.07,
  box = false,
  outwardFrom,
  material = finMaterial,
}: {
  points: Array<[number, number]>
  spacing: number
  y: number
  height: number
  depth?: number
  thickness?: number
  /** 为 true 时用有厚度的盒子，默认仍是薄平面，避免改到塔楼 / 东楼 FinRow。 */
  box?: boolean
  outwardFrom: [number, number]
  material?: Material
}) {
  const fins = useMemo(() => finsAlong(points, spacing, outwardFrom, depth * 0.45), [depth, outwardFrom, points, spacing])
  const geometry = useMemo(() => {
    if (box) {
      // X=沿墙肋宽，Z=法向伸出；实例 rotY 把 +Z 转到外法向。
      return new BoxGeometry(thickness, height, depth)
    }
    const plane = new PlaneGeometry(depth, height)
    plane.rotateY(Math.PI)
    return plane
  }, [box, depth, height, thickness])
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    fins.forEach((fin: FinPoint, index) => {
      dummy.position.set(fin.x, y, fin.z)
      dummy.rotation.set(0, fin.rotY, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.count = fins.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [fins, y])

  if (fins.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, fins.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}
