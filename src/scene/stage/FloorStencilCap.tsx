import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { MeshStandardMaterial, type Group, type Mesh, type Plane } from 'three'
import { solidMaterial } from '../materials'
import { armComposerStencil } from './composerStencil'
import {
  createCapMesh,
  createStencilHost,
  createStencilMaterials,
  createStencilPrimer,
  releaseCapMesh,
  releaseStencilMaterials,
  STENCIL_CAP_LAYER,
  syncCapSurface,
  syncFloorStencilCaps,
  type StencilMaterials,
} from './stencilCap'

type Bundle = {
  host: Group
  materials: StencilMaterials
  cap: Mesh
}

/** 只在切层时挂上。demand 下挂载、卸载和壳集合变化要 invalidate，平时不刷帧。 */
export function FloorStencilCap({ plane }: { plane: Plane }) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const bundle = useRef<Bundle | null>(null)

  useLayoutEffect(() => {
    const materials = createStencilMaterials(plane)
    const cap = createCapMesh(solidMaterial)
    const primer = createStencilPrimer()
    const host = createStencilHost()
    host.add(primer, cap)
    scene.add(host)
    bundle.current = { host, materials, cap }
    camera.layers.enable(STENCIL_CAP_LAYER)
    const composer = armComposerStencil(gl)
    invalidate()
    return () => {
      composer.restore()
      bundle.current = null
      scene.remove(host)
      releaseCapMesh(cap)
      releaseCapMesh(primer)
      releaseStencilMaterials(materials)
      camera.layers.disable(STENCIL_CAP_LAYER)
      delete window.__twinStencilCap
      invalidate()
    }
  }, [camera, gl, invalidate, plane, scene])

  useLayoutEffect(() => {
    invalidate()
  }, [invalidate, plane.constant])

  useFrame(() => {
    const current = bundle.current
    if (!current) return
    const changed = syncFloorStencilCaps(scene, plane, current.host, current.materials)
    const surfaceChanged = syncCapSurface(current.cap.material as MeshStandardMaterial, solidMaterial)
    const shells = (current.host.userData.sources as unknown[] | undefined)?.length ?? 0
    window.__twinStencilCap = { shells, at: performance.now() }
    if (changed || surfaceChanged) invalidate()
  })

  return null
}
