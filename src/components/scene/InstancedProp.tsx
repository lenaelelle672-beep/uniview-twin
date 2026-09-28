import { useLoader } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import type { Placement } from '../../scene/siteGeometry'
import { installMeshopt } from '../../scene/meshopt'

const TREE_HI = '/models/street-tree-hi.glb'
const TREE_LO = '/models/street-tree-lo.glb'
const LAMP = '/models/street-lamp.glb'
const SIGN = '/models/roof-sign.glb'

useLoader.preload(GLTFLoader, TREE_HI, installMeshopt)
useLoader.preload(GLTFLoader, TREE_LO, installMeshopt)
useLoader.preload(GLTFLoader, LAMP, installMeshopt)
useLoader.preload(GLTFLoader, SIGN, installMeshopt)

function collectMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  return meshes
}

function tunePropMaterial(material: MeshStandardMaterial, night: boolean) {
  const name = material.name
  if (!night) {
    material.emissive.set('#000000')
    material.emissiveIntensity = 0
    return
  }
  if (name === 'lamp_light') {
    material.emissive.set('#fff4dc')
    material.emissiveIntensity = 2.4
  } else if (name === 'sign_face') {
    material.emissive.set('#f4f7ff')
    material.emissiveIntensity = 1.6
  } else if (name === 'sign_face_cn') {
    material.emissive.set('#2f6bff')
    material.emissiveIntensity = 1.8
  } else {
    material.emissive.set('#000000')
    material.emissiveIntensity = 0
  }
}

export function InstancedProp({
  url,
  placements,
  night,
  y = 0,
}: {
  url: string
  placements: Placement[]
  night: boolean
  y?: number
}) {
  const gltf = useLoader(GLTFLoader, url, installMeshopt)
  const meshes = useMemo(() => collectMeshes(gltf.scene), [gltf])
  const refs = useRef<Array<InstancedMesh | null>>([])

  useLayoutEffect(() => {
    const dummy = new Object3D()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const scale = new Vector3(1, 1, 1)
    const axisY = new Vector3(0, 1, 0)
    meshes.forEach((mesh, meshIndex) => {
      const instanced = refs.current[meshIndex]
      if (!instanced) return
      const material = mesh.material as MeshStandardMaterial
      tunePropMaterial(material, night)
      placements.forEach((placement, index) => {
        const yaw = placement.rotY === 0 ? index * 1.7 : placement.rotY
        position.set(placement.x, y, placement.z)
        quaternion.setFromAxisAngle(axisY, yaw)
        dummy.matrix.compose(position, quaternion, scale)
        instanced.setMatrixAt(index, dummy.matrix)
      })
      instanced.instanceMatrix.needsUpdate = true
      instanced.computeBoundingSphere()
    })
  }, [meshes, night, placements, y])

  if (placements.length === 0) return null
  return (
    <group>
      {meshes.map((mesh, index) => (
        <instancedMesh
          key={mesh.uuid}
          ref={(node) => {
            refs.current[index] = node
          }}
          args={[mesh.geometry, mesh.material, placements.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

export function RoofSign({ night, position }: { night: boolean; position: [number, number, number] }) {
  const gltf = useLoader(GLTFLoader, SIGN, installMeshopt)
  const sign = useMemo(() => gltf.scene.clone(true), [gltf])
  useLayoutEffect(() => {
    sign.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      tunePropMaterial(mesh.material as MeshStandardMaterial, night)
    })
  }, [night, sign])
  return <primitive object={sign} position={position} />
}

export const PROP_URL = { TREE_HI, TREE_LO, LAMP, SIGN }
