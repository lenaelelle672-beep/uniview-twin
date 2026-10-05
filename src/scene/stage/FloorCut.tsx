import { useLayoutEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Plane, Vector3 } from 'three'
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

/** 选中层楼板顶面作为外壳切面。室内材质不参与裁切。 */
export function FloorCut() {
  const gl = useThree((state) => state.gl)
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const plane = useMemo(() => new Plane(new Vector3(0, -1, 0), 0), [])
  const planes = useMemo(() => [plane], [plane])
  const enabled = useRef(false)

  useLayoutEffect(() => {
    const cut = cutElevation(view, selectedFloor)
    if (cut == null) {
      if (enabled.current) {
        gl.localClippingEnabled = false
        for (const material of [...SHELL_MATERIALS, ...Object.values(REFLECTIVE_ENV_MATERIALS)]) {
          material.clippingPlanes = null
          material.clipShadows = false
          material.needsUpdate = true
        }
        enabled.current = false
      }
      return
    }
    plane.constant = cut
    if (!enabled.current) {
      gl.localClippingEnabled = true
      for (const material of [...SHELL_MATERIALS, ...Object.values(REFLECTIVE_ENV_MATERIALS)]) {
        material.clippingPlanes = planes
        material.clipShadows = true
        material.needsUpdate = true
      }
      enabled.current = true
    }
    return () => {
      gl.localClippingEnabled = false
      for (const material of [...SHELL_MATERIALS, ...Object.values(REFLECTIVE_ENV_MATERIALS)]) {
        material.clippingPlanes = null
        material.clipShadows = false
        material.needsUpdate = true
      }
      enabled.current = false
    }
  }, [gl, plane, planes, selectedFloor, view])

  return null
}
