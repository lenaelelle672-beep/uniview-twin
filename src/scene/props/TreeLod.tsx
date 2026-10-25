import { Detailed } from '@react-three/drei/core/Detailed'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Object3D, type InstancedMesh, type LOD, type Mesh } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { useTwinStore } from '../../store/store'
import { installMeshopt } from '../meshopt'
import { TREE_LOD_DISTANCES, TREE_LOD_HYSTERESIS, TREE_LOD_URL } from './treeLodPlan'

const LEAF = 'tree_leaves'
const DISTANCES = [TREE_LOD_DISTANCES[0], TREE_LOD_DISTANCES[1]]
const dummy = new Object3D()

function materialName(mesh: Mesh): string {
  return Array.isArray(mesh.material) ? '' : mesh.material.name
}

function isInstanced(object: Object3D): object is InstancedMesh {
  return (object as InstancedMesh).isInstancedMesh === true
}

function underTreeLod(object: Object3D): boolean {
  let current: Object3D | null = object
  while (current) {
    if (current.name === 'TreeLod') return true
    current = current.parent
  }
  return false
}

/** 场地里已经摆好的树。阴影专用叶和本组件自己的副本不算。 */
function isStockTree(object: Object3D): object is InstancedMesh {
  if (!isInstanced(object)) return false
  if (object.name === 'tree_leaves_shadow') return false
  if (object.userData.twinTreeLod) return false
  if (underTreeLod(object)) return false
  const name = materialName(object)
  return name === 'tree_trunk' || name === LEAF
}

function collectStock(root: Object3D): InstancedMesh[] {
  const found: InstancedMesh[] = []
  root.traverse((child) => {
    if (isStockTree(child) && child.count > 0) found.push(child)
  })
  return found
}

function stockCount(root: Object3D): number {
  return collectStock(root).reduce((max, mesh) => Math.max(max, mesh.count), 0)
}

function copyInstances(from: InstancedMesh, to: InstancedMesh) {
  const count = Math.min(from.count, to.count)
  to.count = count
  for (let index = 0; index < count; index += 1) {
    from.getMatrixAt(index, dummy.matrix)
    to.setMatrixAt(index, dummy.matrix)
  }
  to.instanceMatrix.needsUpdate = true
  to.computeBoundingSphere()
  to.userData.twinTreeLod = true
}

function meshesOf(gltf: GLTF): Mesh[] {
  const meshes: Mesh[] = []
  gltf.scene.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  return meshes
}

function faceCount(gltf: GLTF): number {
  let faces = 0
  gltf.scene.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const index = mesh.geometry.index
    const count = index ? index.count : (mesh.geometry.getAttribute('position')?.count ?? 0)
    faces += count / 3
  })
  return faces
}

function publish(level: number | null, stockHidden: number, hiFaces: number, loFaces: number) {
  window.__twinTreeLod = {
    on: true,
    reason: 'on',
    distances: [TREE_LOD_DISTANCES[0], TREE_LOD_DISTANCES[1]],
    hysteresis: TREE_LOD_HYSTERESIS,
    level,
    stockHidden,
    hiFaces,
    loFaces,
  }
}

function TreeLevels({ count, hi, lo }: { count: number; hi: GLTF; lo: GLTF }) {
  const lodRef = useRef<LOD>(null)
  const ours = useRef<Array<InstancedMesh | null>>([])
  const hidden = useRef<InstancedMesh[]>([])
  const level = useRef(-1)
  const primed = useRef(false)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const hiMeshes = useMemo(() => meshesOf(hi), [hi])
  const loMeshes = useMemo(() => meshesOf(lo), [lo])
  const hiFaces = useMemo(() => faceCount(hi), [hi])
  const loFaces = useMemo(() => faceCount(lo), [lo])
  const rootRef = useRef<Object3D>(null)
  const ready = hiMeshes.length > 0 && loMeshes.length > 0
  const basement = view === 'floor' && selectedFloor === 'B1'

  const showRoot = (stockHidden: number) => {
    const root = rootRef.current
    if (!root) return
    // 矩阵拷上之前保持隐藏，避免和场地里的树叠两套，也避免先闪到原点。
    root.visible = stockHidden > 0 && !basement
  }

  const syncFromStock = () => {
    const expected = hiMeshes.length + loMeshes.length
    const filled = ours.current.slice(0, expected).every((mesh) => mesh != null)
    if (!filled) return 0
    const stock = collectStock(scene)
    if (stock.length === 0) return 0
    const template = stock[0]
    for (const mesh of ours.current) {
      if (mesh) copyInstances(template, mesh)
    }
    for (const mesh of stock) mesh.visible = false
    hidden.current = stock
    return stock.length
  }

  useLayoutEffect(() => {
    if (!ready) return undefined
    showRoot(syncFromStock())
    const lod = lodRef.current
    if (lod) {
      // 远档默认可见时，第一帧会走滞回阈值。先藏起来，80 m 之外才换成 lo。
      if (!primed.current && lod.levels[1]?.object) {
        lod.levels[1].object.visible = false
        primed.current = true
      }
      lod.updateMatrixWorld(true)
      lod.update(camera)
    }
    invalidate()
    return () => {
      for (const mesh of hidden.current) {
        if (mesh.parent) mesh.visible = true
      }
      hidden.current = []
      invalidate()
    }
  }, [basement, camera, hiMeshes, loMeshes, ready, scene, invalidate])

  useFrame(() => {
    if (!ready) return
    let stockHidden = hidden.current.length
    const detached = stockHidden === 0 || hidden.current.some((mesh) => mesh.parent == null)
    if (detached) stockHidden = syncFromStock()
    else {
      for (const mesh of hidden.current) {
        if (mesh.visible) mesh.visible = false
      }
    }
    showRoot(stockHidden)
    const lod = lodRef.current
    const next = lod ? lod.getCurrentLevel() : null
    const changed = next != null && next !== level.current
    if (changed && next != null) {
      level.current = next
      invalidate()
    }
    const shown = lod ? level.current : null
    const probe = window.__twinTreeLod
    if (!probe?.on || probe.level !== shown || probe.stockHidden !== stockHidden || probe.hiFaces !== hiFaces) {
      publish(shown, stockHidden, hiFaces, loFaces)
    }
  }, 1)

  if (!ready) return null

  const renderSet = (meshes: Mesh[], bucket: 'hi' | 'lo') =>
    meshes.map((mesh, index) => (
      <instancedMesh
        key={`${bucket}-${mesh.uuid}`}
        ref={(node) => {
          const slot = bucket === 'hi' ? index : hiMeshes.length + index
          ours.current[slot] = node
        }}
        args={[mesh.geometry, mesh.material, count]}
        castShadow={materialName(mesh) !== LEAF}
        receiveShadow
        frustumCulled={false}
      />
    ))

  return (
    <group ref={rootRef} name="TreeLod" frustumCulled={false} visible={false}>
      <Detailed ref={lodRef} distances={DISTANCES} hysteresis={TREE_LOD_HYSTERESIS} frustumCulled={false}>
        <group frustumCulled={false}>{renderSet(hiMeshes, 'hi')}</group>
        <group frustumCulled={false}>{renderSet(loMeshes, 'lo')}</group>
      </Detailed>
    </group>
  )
}

function TreeLodGate() {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [count, setCount] = useState(0)
  const hi = useLoader(GLTFLoader, TREE_LOD_URL.hi, installMeshopt) as GLTF
  const lo = useLoader(GLTFLoader, TREE_LOD_URL.lo, installMeshopt) as GLTF

  useLayoutEffect(() => {
    const next = stockCount(scene)
    if (next > 0) setCount(next)
    else invalidate()
  }, [invalidate, scene])

  useFrame(() => {
    if (count > 0) return
    const next = stockCount(scene)
    if (next > 0) setCount(next)
  })

  if (count === 0) return null
  return <TreeLevels count={count} hi={hi} lo={lo} />
}

export function TreeLod() {
  return <TreeLodGate />
}
