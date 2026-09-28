import { useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, InstancedMesh, Object3D } from 'three'
import { finsAlong, type FinPoint } from '../../scene/massing'
import { finMaterial } from '../../scene/materials'

export function FinRow({
  points,
  spacing,
  y,
  height,
  depth = 0.42,
  thickness = 0.07,
  outwardFrom,
}: {
  points: Array<[number, number]>
  spacing: number
  y: number
  height: number
  depth?: number
  thickness?: number
  outwardFrom: [number, number]
}) {
  const fins = useMemo(() => finsAlong(points, spacing, outwardFrom, depth * 0.45), [depth, outwardFrom, points, spacing])
  const geometry = useMemo(() => new BoxGeometry(thickness, height, depth), [depth, height, thickness])
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
      args={[geometry, finMaterial, fins.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  )
}
