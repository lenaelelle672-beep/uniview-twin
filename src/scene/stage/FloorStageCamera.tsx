import { type CameraControls as CameraControlsImpl } from '@react-three/drei/core/CameraControls'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Box3, Object3D, PerspectiveCamera, Vector3 } from 'three'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import { activeFloorId } from './cut'
import { obliqueOverviewSeed } from './poses'
import { workstationPosition } from './workstationPosition'
import { beginCameraMove, markCameraRested, watchCameraRest } from './cameraRest'

type VisibleFocusApi = typeof import('./visibleFocus')
let visibleFocusApi: VisibleFocusApi | null = null

function loadVisibleFocus() {
  if (visibleFocusApi) return
  void import('./visibleFocus').then((mod) => {
    visibleFocusApi = mod
  })
}

type FocusRig = CameraControlsImpl & {
  setFocalOffset?: (x: number, y: number, z: number, enableTransition?: boolean) => Promise<void>
}

const FLOOR_FOV = 48
const DESK_FOV = 42
const FLY_SECONDS = 0.42
const POLAR_DIP = 1.05

const corner = new Vector3()

function setFov(camera: PerspectiveCamera, fov: number) {
  if (!camera.isPerspectiveCamera || Math.abs(camera.fov - fov) <= 0.05) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}

function projectBox(camera: PerspectiveCamera, box: Box3) {
  const xs = [box.min.x, box.max.x]
  const ys = [box.min.y, box.max.y]
  const zs = [box.min.z, box.max.z]
  camera.updateMatrixWorld()
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        corner.set(x, y, z).project(camera)
        minX = Math.min(minX, corner.x)
        maxX = Math.max(maxX, corner.x)
        minY = Math.min(minY, corner.y)
        maxY = Math.max(maxY, corner.y)
      }
    }
  }
  return {
    widthRatio: (maxX - minX) / 2,
    heightRatio: (maxY - minY) / 2,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    minY,
    maxY,
  }
}

function applyVisibleFocalOffset(
  rig: FocusRig,
  camera: PerspectiveCamera,
  canvas: HTMLCanvasElement,
  enableTransition: boolean,
  targetWorld?: Vector3,
) {
  loadVisibleFocus()
  if (!visibleFocusApi) {
    void import('./visibleFocus').then((mod) => {
      visibleFocusApi = mod
      mod.applyVisibleFocalOffset(rig, camera, canvas, enableTransition, targetWorld)
    })
    return
  }
  visibleFocusApi.applyVisibleFocalOffset(rig, camera, canvas, enableTransition, targetWorld)
}

function resetFocalOffset(rig: FocusRig | null) {
  if (visibleFocusApi) {
    visibleFocusApi.resetFocalOffset(rig)
    return
  }
  if (!rig || typeof rig.setFocalOffset !== 'function') return
  void rig.setFocalOffset(0, 0, 0, false)
}

async function frameSlab(
  rig: FocusRig,
  camera: PerspectiveCamera,
  plate: Object3D,
  floorId: string,
  canvas: HTMLCanvasElement,
) {
  plate.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(plate)
  if (box.isEmpty()) return false
  const center = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const seed = obliqueOverviewSeed(center, { x: size.x, z: size.z })
  beginCameraMove('frame-slab')
  rig.smoothTime = 0
  rig.maxPolarAngle = Math.PI / 2 - POLAR_DIP
  setFov(camera, FLOOR_FOV)
  await rig.setLookAt(
    seed.position[0],
    seed.position[1],
    seed.position[2],
    seed.target[0],
    seed.target[1],
    seed.target[2],
    false,
  )
  window.__twinCameraFramed = floorId
  await rig.fitToBox(box, false)
  applyVisibleFocalOffset(rig, camera, canvas, false)
  rig.update(0)
  const fitted = projectBox(camera, box)
  if (fitted.widthRatio > 0.05 && fitted.widthRatio < 0.7) {
    await rig.dollyTo(rig.distance * (fitted.widthRatio / 0.78), false)
    applyVisibleFocalOffset(rig, camera, canvas, false)
    rig.update(0)
  }
  rig.maxPolarAngle = Math.PI
  const settled = projectBox(camera, box)
  window.__twinSlab = { floorId, ...settled }
  window.__twinFlyPromiseAt = performance.now()
  markCameraRested('setLookAt')
  return true
}

function flyToDesk(
  rig: FocusRig,
  camera: PerspectiveCamera,
  interior: Object3D,
  floorId: string,
  deskId: string,
  transition: boolean,
  canvas: HTMLCanvasElement,
) {
  interior.updateWorldMatrix(true, false)
  const local = workstationPosition(floorId, deskId)
  const target = new Vector3(local.x, 0.55, local.z)
  interior.localToWorld(target)
  const eye = target.clone().add(new Vector3(2.6, 5.4, 6.8))
  rig.maxPolarAngle = Math.PI
  setFov(camera, DESK_FOV)
  const started = performance.now()
  delete window.__twinLocate
  window.__twinFlyEnd = { deskId, x: eye.x, y: eye.y, z: eye.z, started }
  // 首帧画出来之前做阻尼，SwiftShader 上要等很久才进入 1.2 m。
  // 直达链接在第一帧提交时直接落到工位；已经在看画面时再平滑飞入。
  beginCameraMove('fly-desk')
  if (!transition) {
    rig.smoothTime = 0
    void rig.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, false).then(() => {
      window.__twinFlyPromiseAt = performance.now()
      markCameraRested('setLookAt')
    })
    applyVisibleFocalOffset(rig, camera, canvas, false, target)
    rig.update(0)
    applyVisibleFocalOffset(rig, camera, canvas, false, target)
    markLocated(deskId, started)
    return true
  }
  rig.smoothTime = FLY_SECONDS
  void rig.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true).then(() => {
    window.__twinFlyPromiseAt = performance.now()
    applyVisibleFocalOffset(rig, camera, canvas, false, target)
    markLocated(deskId, started)
    markCameraRested('setLookAt')
  })
  applyVisibleFocalOffset(rig, camera, canvas, true, target)
  return true
}

function markLocated(deskId: string, started: number) {
  if (window.__twinLocate?.deskId === deskId) return
  window.__twinLocate = {
    ms: Math.round(performance.now()),
    flyMs: Math.round(performance.now() - started),
    deskId,
  }
  window.dispatchEvent(new CustomEvent('twin-locate-rest'))
}

export function FloorStageCamera() {
  const active = useTwinStore((state) => activeFloorId(state.view, state.selectedFloor))
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const invalidate = useThree((state) => state.invalidate)
  const focusSeq = useTwinStore((state) => state.focusSeq)
  const controls = useThree((state) => state.controls)
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  const presented = useRef(false)
  const framedKey = useRef('')

  useEffect(() => {
    const rig = controls as (FocusRig & {
      addEventListener?: (type: string, fn: () => void) => void
      removeEventListener?: (type: string, fn: () => void) => void
    }) | null
    if (!rig?.addEventListener || !rig.removeEventListener) return undefined
    const onStart = () => beginCameraMove('controlstart')
    const onEnd = () => watchCameraRest(rig, invalidate)
    rig.addEventListener('controlstart', onStart)
    rig.addEventListener('controlend', onEnd)
    return () => {
      rig.removeEventListener('controlstart', onStart)
      rig.removeEventListener('controlend', onEnd)
    }
  }, [controls, invalidate])

  useFrame(() => {
    presented.current = true
    const end = window.__twinFlyEnd
    if (end && window.__twinLocate?.deskId !== end.deskId) {
      const perspective = camera as PerspectiveCamera
      const dx = perspective.position.x - end.x
      const dy = perspective.position.y - end.y
      const dz = perspective.position.z - end.z
      if (dx * dx + dy * dy + dz * dz < 1.2 * 1.2) markLocated(end.deskId, end.started)
    }

    const rig = controls as FocusRig | null
    if (!rig || !active) return
    const focused = focusedDeskId ? resolveWorkstationRef(focusedDeskId) : null
    const deskId = focused && focused.floorId === active ? focused.deskId : null
    const key = `${active}:${deskId ?? 'slab'}:${focusSeq}`
    if (framedKey.current === key) return
    if (deskId) {
      const interior = scene.getObjectByName('FloorInterior')
      if (!interior) return
      interior.updateMatrixWorld(true)
      flyToDesk(rig, camera as PerspectiveCamera, interior, active, deskId, false, gl.domElement)
      framedKey.current = key
      watchCameraRest(rig, invalidate)
      return
    }
    const plate = scene.getObjectByName('FloorPlate')
    if (!plate) return
    framedKey.current = key
    void frameSlab(rig, camera as PerspectiveCamera, plate, active, gl.domElement).then((ok) => {
      if (ok) watchCameraRest(rig, invalidate)
    })
  })

  useLayoutEffect(() => {
    const rig = controls as FocusRig | null
    let cancelled = false
    let attempts = 0
    // 以本次提交时是否已经出过帧为准。直达链接的楼板可能要等几帧才挂上，
    // 若等到那时再阻尼，首屏会被 SwiftShader 的长帧拖过 5 秒。
    const glide = focusSeq > 0 && presented.current
    if (active) loadVisibleFocus()
    const tick = () => {
      if (cancelled) return
      const ready = rig && typeof rig.setLookAt === 'function' && typeof rig.fitToBox === 'function'
      if (!ready || !rig) {
        if (attempts < 40) {
          attempts += 1
          requestAnimationFrame(tick)
        }
        return
      }
      if (!active) {
        rig.smoothTime = 0
        resetFocalOffset(rig)
        return
      }
      const focused = focusedDeskId ? resolveWorkstationRef(focusedDeskId) : null
      const deskId = focused && focused.floorId === active ? focused.deskId : null
      if (deskId) {
        const interior = scene.getObjectByName('FloorInterior')
        if (!interior) {
          if (attempts < 90) {
            attempts += 1
            requestAnimationFrame(tick)
          }
          return
        }
        flyToDesk(rig, camera as PerspectiveCamera, interior, active, deskId, glide, gl.domElement)
        framedKey.current = `${active}:${deskId}:${focusSeq}`
        watchCameraRest(rig, invalidate)
        return
      }
      const plate = scene.getObjectByName('FloorPlate')
      if (!plate) {
        if (attempts < 90) {
          attempts += 1
          requestAnimationFrame(tick)
        }
        return
      }
      framedKey.current = `${active}:slab:${focusSeq}`
      void frameSlab(rig, camera as PerspectiveCamera, plate, active, gl.domElement).then((ok) => {
        if (cancelled || !ok) return
        watchCameraRest(rig, invalidate)
      })
    }
    tick()
    return () => {
      cancelled = true
      resetFocalOffset(rig)
    }
  }, [active, camera, controls, focusSeq, focusedDeskId, gl, invalidate, scene, size.height, size.width])

  return null
}
