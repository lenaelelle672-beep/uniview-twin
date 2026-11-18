import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { Object3D } from 'three/src/core/Object3D.js'
import { type InstancedMesh, type Material, type Mesh, type Scene } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { PODIUM_HEIGHT_M } from '../scene/massing'
import { installMeshopt } from '../scene/meshopt'
import {
  makeAddonEaveMesh,
  makeCourtCurbMesh,
  makeCourtPlantMesh,
  makeCourtRiserMesh,
  makeCourtShrubPlacements,
  makeCourtTreadMesh,
  makeEastRoofGrassMesh,
  makePodiumRoofGrassMesh,
  type MeshArrays,
} from './geometry'
import { EAVE_BELOW_ROOF_M } from './plan'

void useLoader

const COURT_TREE_LO = '/models/street-tree-lo.glb'
const COURT_TREE_HI = '/models/street-tree-hi.glb'

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

function collectMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  return meshes
}

/** 叶 180 / 干 28 为 lo，叶 1020 / 干 131 为 hi。阴影面不算。 */
export function treeKindFromVertexCount(materialName: string, vertexCount: number): 'lo' | 'hi' | null {
  if (materialName === 'tree_leaves_shadow') return null
  if (materialName === 'tree_leaves') return vertexCount >= 500 ? 'hi' : vertexCount > 0 ? 'lo' : null
  if (materialName === 'tree_trunk') return vertexCount >= 80 ? 'hi' : vertexCount > 0 ? 'lo' : null
  return null
}

function treeKindFromMesh(mesh: Mesh): 'lo' | 'hi' | null {
  if (mesh.name === 'tree_leaves_shadow') return null
  const count = mesh.geometry.getAttribute('position')?.count ?? 0
  return treeKindFromVertexCount(materialOf(mesh)?.name ?? '', count)
}

/** 先从已挂上的行道树网格借用几何，不依赖 court-shim 的 useLoader / Suspense。 */
function borrowTreeMeshes(root: Object3D, prefer: 'lo' | 'hi'): Mesh[] {
  const byKind: { lo: Mesh[]; hi: Mesh[] } = { lo: [], hi: [] }
  const seen = new Set<string>()
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const kind = treeKindFromMesh(mesh)
    if (!kind) return
    const key = `${kind}:${mesh.geometry.uuid}:${materialOf(mesh)?.name ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    byKind[kind].push(mesh)
  })
  if (byKind[prefer].length > 0) return byKind[prefer]
  return prefer === 'lo' ? byKind.hi : byKind.lo
}

function CourtyardShrubRing({
  url,
  name,
  kind,
  placements,
}: {
  url: string
  name: string
  kind: 'lo' | 'hi'
  placements: ReturnType<typeof makeCourtShrubPlacements>
}) {
  const scene = useThree((state) => state.scene)
  const [meshes, setMeshes] = useState<Mesh[]>(() => borrowTreeMeshes(sceneRoot(scene), kind))
  const refs = useRef<Array<InstancedMesh | null>>([])

  useEffect(() => {
    const borrowed = borrowTreeMeshes(sceneRoot(scene), kind)
    if (borrowed.length > 0) setMeshes(borrowed)
    let cancelled = false
    const loader = new GLTFLoader()
    installMeshopt(loader)
    const ready = loader.meshoptDecoder && loader.meshoptDecoder.ready
    void Promise.resolve(ready)
      .then(() => loader.loadAsync(url))
      .then((gltf) => {
        if (!cancelled) setMeshes(collectMeshes(gltf.scene))
      })
      .catch(() => {
        if (!cancelled && borrowed.length > 0) setMeshes(borrowed)
      })
    return () => {
      cancelled = true
    }
  }, [kind, scene, url])


  useLayoutEffect(() => {
    const dummy = new Object3D()
    for (const instanced of refs.current) {
      if (!instanced) continue
      placements.forEach((placement, index) => {
        dummy.position.set(placement.x, placement.y, placement.z)
        dummy.rotation.set(0, placement.rotY, 0)
        dummy.scale.setScalar(placement.scale)
        dummy.updateMatrix()
        instanced.setMatrixAt(index, dummy.matrix)
      })
      instanced.instanceMatrix.needsUpdate = true
      instanced.computeBoundingSphere()
    }
  }, [meshes, placements])

  if (placements.length === 0) return null
  return (
    <group name={name}>
      {meshes.map((mesh, index) => (
        <instancedMesh
          key={mesh.uuid}
          name={index === 0 ? `${name}Instances` : `${name}Instances_${index}`}
          ref={(node) => {
            refs.current[index] = node
          }}
          args={[mesh.geometry, mesh.material, placements.length]}
          castShadow={true}
          receiveShadow={true}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

function CourtyardShrubs() {
  const placements = useMemo(() => makeCourtShrubPlacements(), [])
  const lo = useMemo(() => placements.filter((item) => item.asset === 'lo'), [placements])
  const hi = useMemo(() => placements.filter((item) => item.asset === 'hi'), [placements])
  return (
    <group name="CourtyardShrubs">
      <CourtyardShrubRing url={COURT_TREE_LO} name="CourtyardShrubLo" kind="lo" placements={lo} />
      <CourtyardShrubRing url={COURT_TREE_HI} name="CourtyardShrubHi" kind="hi" placements={hi} />
    </group>
  )
}

/**
 * T134 / T142 晚到几何：屋顶草（裙房 + 东楼顶）、南侧加建檐口、下沉台阶/圈沿/盆底圈状绿化。
 * 材质从已有网格上借，不新开材质栈，也不重开 T100。矮树复用已有 street-tree-lo / street-tree-hi，晚载模块内原生 InstancedMesh，不重开行道树 LOD 组件。
 */
export function PodiumCourtDetail() {
  const scene = useThree((state) => state.scene)
  const roof = useMemo(() => makePodiumRoofGrassMesh(), [])
  const eastRoof = useMemo(() => makeEastRoofGrassMesh(), [])
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
      {grass ? (
        <mesh name="EastRoofGrass" material={grass} receiveShadow={true} castShadow={true}>
          <ArraysGeometry mesh={eastRoof} />
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
      {grass ? (
        <Suspense fallback={null}>
          <CourtyardShrubs />
        </Suspense>
      ) : null}
    </group>
  )
}
