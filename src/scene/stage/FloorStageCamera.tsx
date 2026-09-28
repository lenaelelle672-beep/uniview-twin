import { type CameraControls as CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { PerspectiveCamera } from 'three'
import { CAMERA_POSES, type CameraPose } from '../cameras'
import { useTwinStore } from '../../store/store'
import { activeFloorId } from './cut'
import { floorCameraPose } from './poses'

const FLY_SECONDS = 1.5

function fly(controls: CameraControlsImpl, camera: PerspectiveCamera, pose: CameraPose, transition: boolean) {
  if (camera.isPerspectiveCamera && Math.abs(camera.fov - pose.fov) > 0.05) {
    camera.fov = pose.fov
    camera.updateProjectionMatrix()
  }
  controls.smoothTime = transition ? FLY_SECONDS : 0
  void controls.setLookAt(
    pose.position[0],
    pose.position[1],
    pose.position[2],
    pose.target[0],
    pose.target[1],
    pose.target[2],
    transition,
  )
}

export function FloorStageCamera() {
  const active = useTwinStore((state) => activeFloorId(state.view, state.selectedFloor))
  const controls = useThree((state) => state.controls)
  const camera = useThree((state) => state.camera)
  const armed = useRef(false)

  useLayoutEffect(() => {
    const rig = controls as CameraControlsImpl | null
    if (!rig || typeof rig.setLookAt !== 'function') return
    const perspective = camera as PerspectiveCamera
    let timer = 0
    const settle = () => {
      timer = window.setTimeout(() => {
        if (rig.smoothTime === FLY_SECONDS) rig.smoothTime = 0
      }, 1800)
    }
    if (active) {
      armed.current = true
      fly(rig, perspective, floorCameraPose(active), true)
      settle()
    } else if (armed.current) {
      armed.current = false
      const cam = useTwinStore.getState().cam
      fly(rig, perspective, cam ? CAMERA_POSES[cam] : CAMERA_POSES.overview, true)
      settle()
    }
    return () => window.clearTimeout(timer)
  }, [active, camera, controls])

  return null
}
