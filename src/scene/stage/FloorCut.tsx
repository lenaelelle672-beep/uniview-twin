import { lazy, Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Material, Plane, Vector3 } from 'three'
import {
  baseMaterial,
  curtainMaterial,
  eaveMaterial,
  finMaterial,
  grilleMaterial,
  jointMaterial,
  solidMaterial,
  stoneMaterial,
} from '../materials'
import { REFLECTIVE_ENV_MATERIALS } from '../../components/scene/LocalEnvironment'
import { useTwinStore } from '../../store/store'
import { cutElevation } from './cut'

const FloorStencilCap = lazy(() => import('./FloorStencilCap').then((mod) => ({ default: mod.FloorStencilCap })))

const SHELL_MATERIALS = [
  curtainMaterial,
  jointMaterial,
  solidMaterial,
  grilleMaterial,
  finMaterial,
  stoneMaterial,
  eaveMaterial,
  baseMaterial,
]

function clipMaterial(material: Material | Material[] | undefined, planes: Plane[] | null, clipShadows: boolean) {
  if (!material) return
  const list = Array.isArray(material) ? material : [material]
  for (const item of list) {
    if (!item) continue
    const next = item as Material & { clipShadows?: boolean }
    if (next.clippingPlanes === planes && next.clipShadows === clipShadows) continue
    next.clippingPlanes = planes
    next.clipShadows = clipShadows
    next.needsUpdate = true
  }
}

/** GLB hi/lo 两套 east_grille，以及可能挂上的阴影深度材质。 */
export function applyEastGrilleCut(
  root: { traverse: (fn: (object: unknown) => void) => void } | null | undefined,
  planes: Plane[] | null,
  clipShadows: boolean,
) {
  if (!root) return
  root.traverse((object) => {
    const mesh = object as {
      material?: Material | Material[]
      customDepthMaterial?: Material
      customDistanceMaterial?: Material
    }
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    const hasGrille = materials.some((item) => item?.name === 'east_grille')
    if (!hasGrille) return
    clipMaterial(mesh.material, planes, clipShadows)
    clipMaterial(mesh.customDepthMaterial, planes, clipShadows)
    clipMaterial(mesh.customDistanceMaterial, planes, clipShadows)
  })
}

function ownedMaterials() {
  return [...SHELL_MATERIALS, ...Object.values(REFLECTIVE_ENV_MATERIALS)]
}

/** 选中层楼板顶面作为外壳切面。室内材质不参与裁切。 */
export function FloorCut() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const plane = useMemo(() => new Plane(new Vector3(0, -1, 0), 0), [])
  const planes = useMemo(() => [plane], [plane])
  const enabled = useRef(false)
  const cutNow = cutElevation(view, selectedFloor)
  if (cutNow != null) plane.constant = cutNow

  useLayoutEffect(() => {
    const cut = cutElevation(view, selectedFloor)
    if (cut == null) {
      if (enabled.current) {
        gl.localClippingEnabled = false
        for (const material of ownedMaterials()) {
          clipMaterial(material, null, false)
        }
        applyEastGrilleCut(scene.getObjectByName('EastGrille'), null, false)
        enabled.current = false
      }
      return
    }
    plane.constant = cut
    gl.localClippingEnabled = true
    for (const material of ownedMaterials()) {
      clipMaterial(material, planes, true)
    }
    applyEastGrilleCut(scene.getObjectByName('EastGrille'), planes, true)
    enabled.current = true
    return () => {
      gl.localClippingEnabled = false
      for (const material of ownedMaterials()) {
        clipMaterial(material, null, false)
      }
      applyEastGrilleCut(scene.getObjectByName('EastGrille'), null, false)
      enabled.current = false
    }
  }, [gl, plane, planes, scene, selectedFloor, view])

  useFrame(() => {
    const cut = cutElevation(view, selectedFloor)
    if (cut == null) {
      applyEastGrilleCut(scene.getObjectByName('EastGrille'), null, false)
      return
    }
    plane.constant = cut
    applyEastGrilleCut(scene.getObjectByName('EastGrille'), planes, true)
  })

  if (cutNow == null) return null
  return (
    <Suspense fallback={null}>
      <FloorStencilCap plane={plane} />
    </Suspense>
  )
}
