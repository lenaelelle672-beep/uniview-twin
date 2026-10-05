import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshDepthMaterial,
  type BufferGeometry,
} from 'three'
import { DEPTH_PROXY_LAYER } from '../overlayOrder'
import { CORRIDOR_PEOPLE_COUNT } from './corridor'
import {
  attachProxyBesideSource,
  bindSharedInstancedProxy,
  configureDepthProxyMaterial,
  createPersonCapsuleGeometry,
  releaseSharedInstancedProxy,
  writePersonInstanceMatrix,
} from './monitorDepthProxy'

const personMatrix = new Matrix4()

function createProxyMesh(name: string, geometry: BufferGeometry, material: MeshDepthMaterial, count: number) {
  const mesh = new InstancedMesh(geometry, material, count)
  mesh.name = name
  mesh.layers.set(DEPTH_PROXY_LAYER)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  mesh.count = 0
  return mesh
}

function InstancedSourceProxy({
  sourceName,
  forceDoubleSide = false,
}: {
  sourceName: string
  forceDoubleSide?: boolean
}) {
  const scene = useThree((state) => state.scene)
  const meshRef = useRef<InstancedMesh | null>(null)
  const placeholderRef = useRef<BufferGeometry | null>(null)
  const materialRef = useRef<MeshDepthMaterial | null>(null)
  const boundRef = useRef<InstancedMesh | null>(null)

  useLayoutEffect(() => {
    const placeholder = new BoxGeometry(0.01, 0.01, 0.01)
    const material = new MeshDepthMaterial()
    configureDepthProxyMaterial(material, undefined, forceDoubleSide)
    const mesh = createProxyMesh(`${sourceName}DepthProxy`, placeholder, material, 1)
    placeholderRef.current = placeholder
    materialRef.current = material
    meshRef.current = mesh
    return () => {
      releaseSharedInstancedProxy(mesh, placeholder)
      mesh.removeFromParent()
      material.dispose()
      placeholder.dispose()
      meshRef.current = null
      boundRef.current = null
    }
  }, [forceDoubleSide, sourceName])

  useFrame(() => {
    const mesh = meshRef.current
    const placeholder = placeholderRef.current
    const material = materialRef.current
    if (!mesh || !placeholder || !material) return
    const source = scene.getObjectByName(sourceName)
    if (!source || !('isInstancedMesh' in source) || !source.isInstancedMesh) {
      if (boundRef.current) {
        releaseSharedInstancedProxy(mesh, placeholder)
        boundRef.current = null
      }
      mesh.count = 0
      return
    }
    const instanced = source as InstancedMesh
    if (boundRef.current !== instanced) {
      configureDepthProxyMaterial(material, instanced.material, forceDoubleSide)
      bindSharedInstancedProxy(mesh, instanced)
      boundRef.current = instanced
    } else {
      mesh.count = instanced.count
    }
    attachProxyBesideSource(mesh, instanced)
  })

  return null
}

function PeopleCapsuleProxy() {
  const scene = useThree((state) => state.scene)
  const meshRef = useRef<InstancedMesh | null>(null)
  const geometryRef = useRef<BufferGeometry | null>(null)
  const materialRef = useRef<MeshDepthMaterial | null>(null)

  useLayoutEffect(() => {
    const geometry = createPersonCapsuleGeometry()
    const material = new MeshDepthMaterial()
    configureDepthProxyMaterial(material, undefined, false)
    const mesh = createProxyMesh('CorridorPeopleDepthProxy', geometry, material, CORRIDOR_PEOPLE_COUNT)
    geometryRef.current = geometry
    materialRef.current = material
    meshRef.current = mesh
    return () => {
      mesh.removeFromParent()
      material.dispose()
      geometry.dispose()
      meshRef.current = null
    }
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const people = scene.getObjectByName('CorridorPeople')
    if (!people) {
      mesh.count = 0
      return
    }
    if (mesh.parent !== people) people.add(mesh)
    let count = 0
    for (let index = 0; index < CORRIDOR_PEOPLE_COUNT; index += 1) {
      const person = people.getObjectByName(`Person-${index}`)
      if (!person) continue
      writePersonInstanceMatrix(person, personMatrix)
      mesh.setMatrixAt(count, personMatrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })

  return null
}

/** 只给 AfterTone 离屏深度用。主相机层 0 看不见。 */
export function MonitorDepthProxies() {
  const group = useRef<Group>(null)
  return (
    <group ref={group} name="MonitorDepthProxies" frustumCulled={false}>
      <InstancedSourceProxy sourceName="WorkstationChairs" forceDoubleSide />
      <InstancedSourceProxy sourceName="OfficeDesks" />
      <PeopleCapsuleProxy />
    </group>
  )
}
