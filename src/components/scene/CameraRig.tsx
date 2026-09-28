import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Box3, Group, PerspectiveCamera } from 'three'
import { CAMERA_POSES } from '../../scene/cameras'
import { useTwinStore } from '../../store/store'

export function FitBump({ onReady }: { onReady: () => void }) {
  useLayoutEffect(() => {
    onReady()
  }, [onReady])
  return null
}

export function CameraRig({
  fitRef,
  fitGeneration,
}: {
  fitRef: RefObject<Group | null>
  fitGeneration: number
}) {
  const cam = useTwinStore((state) => state.cam)
  const controls = useRef<CameraControls>(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera
    const rig = controls.current
    const group = fitRef.current
    if (!rig) return
    rig.smoothTime = 0
    if (!cam) {
      if (!group) return
      const bounds = new Box3().setFromObject(group)
      if (bounds.isEmpty()) return
      const fov = CAMERA_POSES.overview.fov
      if (perspective.isPerspectiveCamera && perspective.fov !== fov) {
        perspective.fov = fov
        perspective.updateProjectionMatrix()
      }
      const pose = CAMERA_POSES.overview
      // fitToBox 把极角吸附到最近的 π/2。水平南立面会把下沉内壁切成一条缝。
      // 先把最大极角收到南侧斜俯，让 fitToBox 按这个方向框住楼和场地，再放开限制。
      const dip = 0.42
      rig.maxPolarAngle = Math.PI / 2 - dip
      void rig.setLookAt(
        pose.position[0],
        pose.position[1],
        pose.position[2],
        pose.target[0],
        pose.target[1],
        pose.target[2],
        false,
      )
      void rig.fitToBox(bounds, false, {
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 8,
        paddingBottom: 6,
      })
      rig.maxPolarAngle = Math.PI
      return
    }
    const pose = CAMERA_POSES[cam]
    if (perspective.isPerspectiveCamera && perspective.fov !== pose.fov) {
      perspective.fov = pose.fov
      perspective.updateProjectionMatrix()
    }
    void rig.setLookAt(
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.target[0],
      pose.target[1],
      pose.target[2],
      false,
    )
  }, [cam, camera, fitGeneration, fitRef, size.height, size.width])

  return <CameraControls ref={controls} makeDefault smoothTime={0} />
}
