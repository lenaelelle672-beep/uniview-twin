import { useFrame, useLoader } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import type { Placement } from '../../scene/siteGeometry'
import { installMeshopt } from '../../scene/meshopt'

const TREE_HI = '/models/street-tree-hi.glb'
const TREE_LO = '/models/street-tree-lo.glb'
const LAMP = '/models/street-lamp.glb'
const SIGN = '/models/roof-sign.glb'
const LEAF_MATERIAL = 'tree_leaves'

// 只预加载每档都会用到的模型。精细树不能在这里预加载，否则性能档也会请求它。
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

function materialName(mesh: Mesh): string {
  return Array.isArray(mesh.material) ? '' : mesh.material.name
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

function applyPlacements(instanced: InstancedMesh, placements: Placement[], y: number) {
  const dummy = new Object3D()
  const position = new Vector3()
  const quaternion = new Quaternion()
  const scale = new Vector3(1, 1, 1)
  const axisY = new Vector3(0, 1, 0)
  placements.forEach((placement, index) => {
    const yaw = placement.rotY === 0 ? index * 1.7 : placement.rotY
    position.set(placement.x, y, placement.z)
    quaternion.setFromAxisAngle(axisY, yaw)
    dummy.matrix.compose(position, quaternion, scale)
    instanced.setMatrixAt(index, dummy.matrix)
  })
  instanced.instanceMatrix.needsUpdate = true
  instanced.computeBoundingSphere()
}

export function InstancedProp({
  url,
  placements,
  night,
  y = 0,
  leafCastShadow = true,
}: {
  url: string
  placements: Placement[]
  night: boolean
  y?: number
  leafCastShadow?: boolean
}) {
  const gltf = useLoader(GLTFLoader, url, installMeshopt)
  const meshes = useMemo(() => collectMeshes(gltf.scene), [gltf])
  const refs = useRef<Array<InstancedMesh | null>>([])

  useLayoutEffect(() => {
    meshes.forEach((mesh, meshIndex) => {
      const instanced = refs.current[meshIndex]
      if (!instanced) return
      const material = mesh.material as MeshStandardMaterial
      tunePropMaterial(material, night)
      applyPlacements(instanced, placements, y)
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
          castShadow={leafCastShadow || materialName(mesh) !== LEAF_MATERIAL}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

/**
 * 远景树叶只负责投影。阴影 pass 在主 pass 之前，投影后立刻隐藏，
 * 避免低模树叶进入主 pass（three 的阴影层测试用的是主相机，不能靠 layers 藏起来）。
 */
export function FoliageShadow({
  url,
  placements,
  y = 0,
}: {
  url: string
  placements: Placement[]
  y?: number
}) {
  const gltf = useLoader(GLTFLoader, url, installMeshopt)
  const leaf = useMemo(
    () => collectMeshes(gltf.scene).find((mesh) => materialName(mesh) === LEAF_MATERIAL) ?? null,
    [gltf],
  )
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    applyPlacements(mesh, placements, y)
    mesh.onAfterShadow = () => {
      mesh.visible = false
    }
    return () => {
      mesh.onAfterShadow = () => {}
    }
  }, [leaf, placements, y])

  useFrame(() => {
    const mesh = ref.current
    if (mesh) mesh.visible = true
  })

  if (!leaf || placements.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      name="tree_leaves_shadow"
      args={[leaf.geometry, leaf.material, placements.length]}
      castShadow
      receiveShadow={false}
      frustumCulled={false}
    />
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
