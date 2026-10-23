import { Wireframe } from '@react-three/drei/core/Wireframe'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BufferGeometry, Group, Material, Mesh } from 'three'
import { useTwinStore } from '../../store/store'
import { wireframeOverlayOn } from './latch'
import { collectWireMeshes, prepareWireGeometry, sameMeshList, wireTargetMode } from './targets'

function ignoreRaycast() {}

function sourcePlanes(mesh: Mesh): Material['clippingPlanes'] {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  return material?.clippingPlanes ?? null
}

/**
 * 把外壳的切面同步到线框材质上。
 * 只改线框自己的材质，不碰外壳材质，也不改雾。
 */
function syncOverlay(group: Group, source: Mesh) {
  const planes = sourcePlanes(source)
  const next = planes && planes.length > 0 ? planes : null
  group.traverse((object) => {
    object.raycast = ignoreRaycast
    const mesh = object as Mesh
    const material = mesh.material
    if (!material || Array.isArray(material)) return
    if ((material.clippingPlanes ?? null) === next) return
    material.clippingPlanes = next
    material.clipShadows = Boolean(next)
    material.needsUpdate = true
  })
}

function WireOnMesh({ mesh }: { mesh: Mesh }) {
  const invalidate = useThree((state) => state.invalidate)
  const ref = useRef<Group>(null)
  const held = useRef<BufferGeometry | null>(null)
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)

  useEffect(() => {
    const next = prepareWireGeometry(mesh.geometry)
    held.current = next
    setGeometry(next)
    return () => {
      // StrictMode 会同步再挂一次，held 已经指向新几何，这里只释放被换掉的那份。
      queueMicrotask(() => {
        if (held.current !== next) {
          next?.dispose()
          return
        }
        held.current = null
        next?.dispose()
      })
    }
  }, [mesh.geometry])

  useLayoutEffect(() => {
    const group = ref.current
    if (!group) return
    syncOverlay(group, mesh)
    invalidate()
    return () => invalidate()
  }, [geometry, invalidate, mesh])

  useFrame(() => {
    const group = ref.current
    if (group) syncOverlay(group, mesh)
  })

  if (!geometry) return null
  return createPortal(
    <group ref={ref} name="WireOverlay">
      <Wireframe
        geometry={geometry}
        stroke="#e7eef8"
        fill="#000000"
        fillOpacity={0}
        fillMix={0}
        strokeOpacity={1}
        thickness={0.06}
        depthWrite={false}
        toneMapped={false}
      />
    </group>,
    mesh,
  )
}

function ShellWireframeLive() {
  const view = useTwinStore((state) => state.view)
  const floorId = useTwinStore((state) => state.selectedFloor)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [meshes, setMeshes] = useState<Mesh[]>([])
  const mode = wireTargetMode(view, floorId)

  useLayoutEffect(() => {
    invalidate()
    return () => invalidate()
  }, [invalidate, meshes, mode])

  useEffect(() => {
    const stamp = {
      mode,
      floorId: mode === 'floor' ? floorId : null,
      count: meshes.length,
      names: meshes.map((mesh) => mesh.name),
    }
    window.__twinWire = stamp
    return () => {
      if (window.__twinWire === stamp) delete window.__twinWire
    }
  }, [floorId, meshes, mode])

  useFrame(() => {
    const next = collectWireMeshes(scene, mode, floorId)
    setMeshes((prev) => (sameMeshList(prev, next) ? prev : next))
  })

  return (
    <group name="WireframeOverlay">
      {meshes.map((mesh) => (
        <WireOnMesh key={mesh.uuid} mesh={mesh} />
      ))}
    </group>
  )
}

/** 默认不挂。Edges 开着时让位。几何用克隆，外壳材质保持原样。 */
export function ShellWireframe() {
  const on = useTwinStore((state) => wireframeOverlayOn(state.layers))
  if (!on) return null
  return <ShellWireframeLive />
}
