import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { Material, Mesh, Object3D, Scene } from 'three'
import { PODIUM_HEIGHT_M } from '../scene/massing'
import {
  makeAddonEaveMesh,
  makeCourtCurbMesh,
  makeCourtPlantMesh,
  makeCourtRiserMesh,
  makeCourtTreadMesh,
  makeRoofGrassMesh,
  type MeshArrays,
} from './geometry'
import { EAVE_BELOW_ROOF_M } from './plan'

function ArraysGeometry({ mesh }: { mesh: MeshArrays }) {
  const positions = useMemo(() => new Float32Array(mesh.positions), [mesh])
  const normals = useMemo(() => new Float32Array(mesh.normals), [mesh])
  const uvs = useMemo(() => new Float32Array(mesh.uvs), [mesh])
  const indices = useMemo(() => new Uint32Array(mesh.indices), [mesh])
  return (
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      <bufferAttribute attach="attributes-normal" args={[normals, 3]} />
      <bufferAttribute attach="attributes-uv" args={[uvs, 2]} />
      <bufferAttribute attach="index" args={[indices, 1]} />
    </bufferGeometry>
  )
}

function materialOf(object: Mesh | undefined): Material | undefined {
  const material = object?.material
  if (!material) return undefined
  return Array.isArray(material) ? material[0] : material
}

function sceneRoot(scene: Scene): Object3D {
  const twin = window.__twinScene
  return twin ?? scene
}

/**
 * T134 晚到几何：屋顶草、南侧加建檐口、下沉台阶/圈沿/盆底绿化。
 * 材质从已有网格上借，不新开材质栈，也不重开 T100。
 */
export function PodiumCourtDetail() {
  const scene = useThree((state) => state.scene)
  const roof = useMemo(() => makeRoofGrassMesh(), [])
  const addonEave = useMemo(() => makeAddonEaveMesh(), [])
  const curb = useMemo(() => makeCourtCurbMesh(), [])
  const treads = useMemo(() => makeCourtTreadMesh(), [])
  const risers = useMemo(() => makeCourtRiserMesh(), [])
  const plants = useMemo(() => makeCourtPlantMesh(), [])
  const [roofVisible, setRoofVisible] = useState(true)
  const [live, setLive] = useState(true)
  const [grass, setGrass] = useState<Material | undefined>(() =>
    materialOf(sceneRoot(scene).getObjectByName('Park') as Mesh | undefined),
  )
  const [wall, setWall] = useState<Material | undefined>(() =>
    materialOf(sceneRoot(scene).getObjectByName('CourtyardWall') as Mesh | undefined),
  )
  const [eave, setEave] = useState<Material | undefined>(() =>
    materialOf(sceneRoot(scene).getObjectByName('PodiumEave') as Mesh | undefined),
  )
  const [paving, setPaving] = useState<Material | undefined>(() => {
    const root = sceneRoot(scene)
    return (
      materialOf(root.getObjectByName('Parcel') as Mesh | undefined) ??
      materialOf(root.getObjectByName('CourtyardWall') as Mesh | undefined)
    )
  })
  const lastCut = useRef<boolean | null>(null)

  useFrame(() => {
    const root = sceneRoot(scene)
    const nextGrass = materialOf(root.getObjectByName('Park') as Mesh | undefined)
    const nextWall = materialOf(root.getObjectByName('CourtyardWall') as Mesh | undefined)
    const nextEave = materialOf(root.getObjectByName('PodiumEave') as Mesh | undefined)
    const nextPaving = materialOf(root.getObjectByName('Parcel') as Mesh | undefined) ?? nextWall
    if (nextGrass !== grass) setGrass(nextGrass)
    if (nextWall !== wall) setWall(nextWall)
    if (nextEave !== eave) setEave(nextEave)
    if (nextPaving !== paving) setPaving(nextPaving)

    const podium = root.getObjectByName('Podium')
    const parentVisible = podium?.visible !== false && podium?.parent?.visible !== false
    if (parentVisible !== live) setLive(parentVisible)
    const eaveMesh = root.getObjectByName('PodiumEave') as Mesh | undefined
    const planes = materialOf(eaveMesh)?.clippingPlanes
    const plane = planes && planes.length > 0 ? planes[0] : null
    const showRoof = !plane || (plane.constant ?? 0) >= PODIUM_HEIGHT_M
    if (lastCut.current !== showRoof) {
      lastCut.current = showRoof
      setRoofVisible(showRoof)
    }
  })

  return (
    <group name="PodiumCourtDetail" visible={live}>
      {grass && roofVisible ? (
        <mesh name="PodiumRoofGrass" material={grass} receiveShadow={true} castShadow={true}>
          <ArraysGeometry mesh={roof} />
        </mesh>
      ) : null}
      {eave ? (
        <mesh
          name="PodiumSouthEave"
          material={eave}
          position={[0, PODIUM_HEIGHT_M - EAVE_BELOW_ROOF_M, 0]}
          castShadow={true}
          receiveShadow={true}
        >
          <ArraysGeometry mesh={addonEave} />
        </mesh>
      ) : null}
      {paving ? (
        <mesh name="CourtyardCurb" material={paving} receiveShadow={true} castShadow={true}>
          <ArraysGeometry mesh={curb} />
        </mesh>
      ) : null}
      {paving ? (
        <mesh name="CourtyardSteps" material={paving} receiveShadow={true} castShadow={true}>
          <ArraysGeometry mesh={treads} />
        </mesh>
      ) : null}
      {wall ? (
        <mesh name="CourtyardRisers" material={wall} receiveShadow={true}>
          <ArraysGeometry mesh={risers} />
        </mesh>
      ) : null}
      {grass ? (
        <mesh name="CourtyardPlanting" material={grass} receiveShadow={true}>
          <ArraysGeometry mesh={plants} />
        </mesh>
      ) : null}
    </group>
  )
}
