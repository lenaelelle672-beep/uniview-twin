import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { PerspectiveCamera } from 'three'
import { CAMERA_POSES } from '../../scene/cameras'
import { useTwinStore } from '../../store/store'

export function CameraRig() {
  const cam = useTwinStore((state) => state.cam)
  const controls = useRef<CameraControls>(null)
  const camera = useThree((state) => state.camera)

  useLayoutEffect(() => {
    const pose = cam ? CAMERA_POSES[cam] : CAMERA_POSES.overview
    const perspective = camera as PerspectiveCamera
    if (perspective.isPerspectiveCamera && perspective.fov !== pose.fov) {
      perspective.fov = pose.fov
      perspective.updateProjectionMatrix()
    }
    const rig = controls.current
    if (!rig) return
    rig.smoothTime = 0
    void rig.setLookAt(pose.position[0], pose.position[1], pose.position[2], pose.target[0], pose.target[1], pose.target[2], false)
  }, [cam, camera])

  return <CameraControls ref={controls} makeDefault smoothTime={0} />
}
