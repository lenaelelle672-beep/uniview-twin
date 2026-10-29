import { useLoader, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Quaternion, Scene, Vector3, type Camera, type Light, type WebGLShadowMap } from 'three'
import { propNightEmissive } from '../../scene/props/emissive'
import type { Placement } from '../../scene/siteGeometry'
import { installMeshopt } from '../../scene/meshopt'
import { markTreeLoReady } from '../../scene/overviewReady'

const TREE_HI = '/models/street-tree-hi.glb'
const TREE_LO = '/models/street-tree-lo.glb'
const LAMP = '/models/street-lamp.glb'
const LEAF_MATERIAL = 'tree_leaves'

// 灯和树 lo 三档都用（主树或阴影）。精细树不预加载，避免性能档也去拉。
useLoader.preload(GLTFLoader, LAMP, installMeshopt)
useLoader.preload(GLTFLoader, TREE_LO, installMeshopt)

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
  const tune = propNightEmissive(material.name, night)
  material.emissive.set(tune.color)
  material.emissiveIntensity = tune.intensity
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
  if (url === TREE_LO) markTreeLoReady()
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
 * 主相机的投影列表在阴影 pass 之前就建好了，事后隐藏来不及。
 * 远景树叶平时不可见，只在 shadowMap.render 里短暂打开。
 */
function bindShadowOnly(mesh: InstancedMesh, shadowMap: WebGLShadowMap) {
  const map = shadowMap as WebGLShadowMap & { __f?: Set<InstancedMesh> }
  if (!map.__f) {
    map.__f = new Set()
    const render = map.render.bind(map)
    map.render = (lights: Light[], scene: Scene, camera: Camera) => {
      for (const item of map.__f!) item.visible = true
      render(lights, scene, camera)
      for (const item of map.__f!) item.visible = false
    }
  }
  mesh.visible = false
  map.__f.add(mesh)
  return () => {
    map.__f?.delete(mesh)
  }
}

export function FoliageShadow({
  url,
  placements,
  y = 0,
}: {
  url: string
  placements: Placement[]
  y?: number
}) {
  const gl = useThree((state) => state.gl)
  const gltf = useLoader(GLTFLoader, url, installMeshopt)
  markTreeLoReady()
  const leaf = useMemo(
    () => collectMeshes(gltf.scene).find((mesh) => materialName(mesh) === LEAF_MATERIAL) ?? null,
    [gltf],
  )
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    applyPlacements(mesh, placements, y)
    return bindShadowOnly(mesh, gl.shadowMap)
  }, [gl, leaf, placements, y])

  if (!leaf || placements.length === 0) return null
  return (
    <instancedMesh
      ref={ref}
      name="tree_leaves_shadow"
      args={[leaf.geometry, leaf.material, placements.length]}
      castShadow
      receiveShadow={false}
      frustumCulled={false}
      visible={false}
    />
  )
}

export const PROP_URL = { TREE_HI, TREE_LO, LAMP }
