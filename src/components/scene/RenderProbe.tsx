import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Box3, Raycaster, Vector3 } from 'three'
import { useTwinStore } from '../../store/store'

const projected = new Vector3()
const grilleBox = new Box3()
const raycaster = new Raycaster()
const rayOrigin = new Vector3()
const rayTarget = new Vector3()
const rayDir = new Vector3()

export function RenderProbe() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    window.__twinReady = true
    window.__twinProject = (x, y, z) => {
      const rect = gl.domElement.getBoundingClientRect()
      projected.set(x, y, z).project(camera)
      return {
        x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
        behind: projected.z > 1,
      }
    }
    window.__twinRaycast = (x1, y1, z1, x2, y2, z2) => {
      rayOrigin.set(x1, y1, z1)
      rayTarget.set(x2, y2, z2)
      rayDir.copy(rayTarget).sub(rayOrigin)
      const span = rayDir.length()
      raycaster.set(rayOrigin, rayDir.normalize())
      raycaster.far = span + 1
      return raycaster.intersectObjects(scene.children, true).slice(0, 8).map((hit) => ({
        name: hit.object.name,
        parent: hit.object.parent?.name ?? '',
        distance: hit.distance,
        point: hit.point.toArray(),
      }))
    }
    const unsubscribe = useTwinStore.subscribe((state) => {
      window.__twinFly = state.floorFlyRequest
      window.__twinView = state.view
      window.__twinSelected = state.selectedFloor
    })
    window.__twinView = useTwinStore.getState().view
    window.__twinSelected = useTwinStore.getState().selectedFloor
    return () => {
      window.__twinReady = false
      unsubscribe()
    }
  }, [camera, gl, scene])

  useFrame(() => {
    window.__twinStats = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    }
    const items: NonNullable<Window['__twinGrille']> = []
    scene.traverse((obj) => {
      const mesh = obj as { isMesh?: boolean; material?: { name?: string } | Array<{ name?: string }> }
      const matName = mesh.isMesh
        ? Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.name).join(',')
          : mesh.material?.name
        : ''
      if (obj.name !== 'EastGrille' && matName !== 'east_grille') return
      const e = obj.matrixWorld.elements
      grilleBox.setFromObject(obj)
      items.push({
        name: obj.name,
        type: obj.type,
        visible: obj.visible,
        world: [e[12], e[13], e[14]],
        box: [grilleBox.min.x, grilleBox.min.y, grilleBox.min.z, grilleBox.max.x, grilleBox.max.y, grilleBox.max.z],
      })
    })
    if (items.length > 0) window.__twinGrille = items
  })

  return null
}
