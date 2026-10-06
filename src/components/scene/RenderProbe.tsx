import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Box3, Raycaster, Vector2, Vector3 } from 'three'
import { markSuspenseReady, resetOverviewReadyMarks } from '../../scene/overviewReady'
import { PICK_VOLUME_LAYER } from '../../scene/pickLayers'
import { useTwinStore } from '../../store/store'

const projected = new Vector3()
const grilleBox = new Box3()
const raycaster = new Raycaster()
const rayOrigin = new Vector3()
const rayTarget = new Vector3()
const rayDir = new Vector3()
const ndc = new Vector2()
const pickHits: ReturnType<Raycaster['intersectObjects']> = []

export function RenderProbe() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    invalidate()
    markSuspenseReady()
    window.__twinScene = scene
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
      raycaster.layers.disable(PICK_VOLUME_LAYER)
      raycaster.set(rayOrigin, rayDir.normalize())
      raycaster.far = span + 1
      return raycaster.intersectObjects(scene.children, true).slice(0, 8).map((hit) => ({
        name: hit.object.name,
        parent: hit.object.parent?.name ?? '',
        distance: hit.distance,
        point: hit.point.toArray(),
      }))
    }
    window.__twinCanvasProject = (x, y, z) => {
      const rect = gl.domElement.getBoundingClientRect()
      projected.set(x, y, z).project(camera)
      return {
        x: (projected.x * 0.5 + 0.5) * rect.width,
        y: (-projected.y * 0.5 + 0.5) * rect.height,
        behind: projected.z > 1,
      }
    }
    window.__twinPick = (cx, cy) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.set((cx / rect.width) * 2 - 1, -(cy / rect.height) * 2 + 1)
      raycaster.layers.disable(PICK_VOLUME_LAYER)
      raycaster.setFromCamera(ndc, camera)
      raycaster.far = 4000
      pickHits.length = 0
      raycaster.intersectObjects(scene.children, true, pickHits)
      const hit = pickHits[0]
      if (!hit) return null
      const mesh = hit.object as { material?: { name?: string } | Array<{ name?: string }> }
      const matName = Array.isArray(mesh.material)
        ? mesh.material.map((item) => item.name).join(',')
        : (mesh.material?.name ?? '')
      return {
        name: hit.object.name,
        parent: hit.object.parent?.name ?? '',
        material: matName,
        distance: hit.distance,
        point: hit.point.toArray() as [number, number, number],
      }
    }
    window.__twinSelected = useTwinStore.getState().selectedFloor
    window.__twinView = useTwinStore.getState().view
    window.__twinDevices = useTwinStore.getState().devices
    window.__twinFocusDevice = (target) => useTwinStore.getState().focusDevice(target)
    window.__twinSelectFloor = (floorId) => useTwinStore.getState().setSelectedFloor(floorId)
    window.__twinSetExploded = (exploded) => useTwinStore.getState().setExploded(exploded)
    const unsubscribe = useTwinStore.subscribe((state) => {
      window.__twinFly = state.floorFlyRequest
      window.__twinSelected = state.selectedFloor
      window.__twinView = state.view
      window.__twinDevices = state.devices
    })
    return () => {
      resetOverviewReadyMarks()
      delete window.__twinSelected
      delete window.__twinView
      delete window.__twinSetExploded
      unsubscribe()
    }
  }, [camera, gl, invalidate, scene])

  useFrame(() => {
    gl.info.autoReset = false
    gl.info.reset()
  }, -1)

  useFrame(() => {
    if (window.__twinReadyAt != null && window.__twinFirstFrameAt == null) {
      window.__twinFirstFrameAt = performance.now()
      window.__twinFirstFrameUnixMs = Date.now()
    }
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
    window.__twinMemory = {
      textures: gl.info.memory.textures,
      geometries: gl.info.memory.geometries,
      programs: gl.info.programs?.length ?? 0,
    }
    const watch = window.__twinFrameWatch
    if (!watch?.active) return
    const source = gl.domElement
    if (!watch.scratch) {
      watch.scratch = document.createElement('canvas')
      watch.scratchCtx = watch.scratch.getContext('2d', { willReadFrequently: true })
    }
    const scratch = watch.scratch
    const ctx = watch.scratchCtx
    if (!ctx) return
    scratch.width = source.width
    scratch.height = source.height
    ctx.drawImage(source, 0, 0)
    const image = ctx.getImageData(0, 0, scratch.width, scratch.height)
    watch.frames.push(
      classifyFrame(image.data, image.width, image.height, performance.now(), Boolean(gl.domElement.closest('.scene-root')?.querySelector('[data-twin-freeze]'))),
    )
  }, 8)

  return null
}

function classifyFrame(data: Uint8ClampedArray, width: number, height: number, at: number, freezeUp: boolean) {
  let empty = 0
  let dark = 0
  let building = 0
  const total = width * height
  const step = Math.max(1, Math.floor(total / 4000))
  let samples = 0
  for (let index = 0; index < total; index += step) {
    const offset = index * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    samples += 1
    if (max < 8) dark += 1
    // 清屏色 #c5d7ea 或全黑，几乎没有建筑细节
    if (max < 8 || (Math.abs(r - 197) < 12 && Math.abs(g - 215) < 12 && Math.abs(b - 234) < 12 && max - min < 18)) {
      empty += 1
    } else if (b > r + 8 && g > 80 && max - min > 20) {
      building += 1
    }
  }
  const emptyRatio = empty / samples
  const darkRatio = dark / samples
  const buildingRatio = building / samples
  const badgeOnly = emptyRatio > 0.8 && buildingRatio < 0.04 && darkRatio > 0.005 && darkRatio < 0.25
  return {
    at,
    width,
    height,
    emptyRatio,
    darkRatio,
    buildingRatio,
    badgeOnly,
    freezeUp,
    empty: emptyRatio > 0.97 || darkRatio > 0.92,
  }
}
