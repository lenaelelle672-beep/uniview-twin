import { CameraControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_POSES } from '../../scene/cameras'
import { EAST_ROOF_M } from '../../scene/massing'
import { COURTYARD, FOOTPRINT, PARCEL_WORLD, TOWER } from '../../scene/siteGeometry'
import { TOWER_ROOF_M } from '../../data/floors'
import { useTwinStore } from '../../store/store'

function buildingSiteBox(): Box3 {
  const box = new Box3()
  PARCEL_WORLD.forEach(([x, z]) => {
    box.expandByPoint(new Vector3(x, -COURTYARD.depth, z))
    box.expandByPoint(new Vector3(x, 0.4, z))
  })
  box.expandByPoint(new Vector3(TOWER.minX - 2, -COURTYARD.depth, TOWER.minZ - 2))
  box.expandByPoint(new Vector3(TOWER.maxX + 2, TOWER_ROOF_M + 4.4, TOWER.maxZ + 2))
  box.expandByPoint(new Vector3(FOOTPRINT.minX - 2, 0, FOOTPRINT.minZ - 2))
  box.expandByPoint(new Vector3(FOOTPRINT.maxX + 2, EAST_ROOF_M, FOOTPRINT.maxZ + 8))
  box.expandByPoint(new Vector3(COURTYARD.cx - COURTYARD.rx - 2, -COURTYARD.depth, COURTYARD.cz - COURTYARD.rz - 2))
  box.expandByPoint(new Vector3(COURTYARD.cx + COURTYARD.rx + 2, 1, COURTYARD.cz + COURTYARD.rz + 2))
  return box
}

export function CameraRig() {
  const cam = useTwinStore((state) => state.cam)
  const controls = useRef<CameraControls>(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const bounds = useMemo(() => buildingSiteBox(), [])

  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera
    const rig = controls.current
    if (!rig) return
    rig.smoothTime = 0
    if (!cam) {
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
  }, [bounds, cam, camera, size.height, size.width])

  return <CameraControls ref={controls} makeDefault smoothTime={0} />
}
