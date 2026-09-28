import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { TOWER_ROOF_M } from '../../data/floors'
import { CAMERA_LIMITS, CAMERA_POSES, maxPolarAngleAboveGround } from '../../scene/cameras'
import { EAST_ROOF_M } from '../../scene/massing'
import { COURTYARD, FOOTPRINT, PARCEL_WORLD, TOWER } from '../../scene/siteGeometry'
import { useTwinStore } from '../../store/store'

const targetScratch = new Vector3()
const positionScratch = new Vector3()

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

function applyCameraLimits(rig: CameraControls) {
  rig.minDistance = CAMERA_LIMITS.minDistance
  rig.maxDistance = CAMERA_LIMITS.maxDistance
  rig.minPolarAngle = CAMERA_LIMITS.minPolarAngle
  rig.infinityDolly = false

  rig.getTarget(targetScratch, true)
  if (targetScratch.y < CAMERA_LIMITS.minTargetY) {
    rig.setTarget(targetScratch.x, CAMERA_LIMITS.minTargetY, targetScratch.z, false)
    targetScratch.y = CAMERA_LIMITS.minTargetY
  }

  const distance = Math.max(rig.distance, CAMERA_LIMITS.minDistance)
  const maxPhi = maxPolarAngleAboveGround(targetScratch.y, distance)
  rig.maxPolarAngle = Math.max(maxPhi, CAMERA_LIMITS.minPolarAngle + 0.01)
  if (rig.polarAngle > rig.maxPolarAngle) rig.polarAngle = rig.maxPolarAngle

  rig.getPosition(positionScratch, true)
  if (positionScratch.y < CAMERA_LIMITS.minCameraY) {
    rig.setPosition(positionScratch.x, CAMERA_LIMITS.minCameraY, positionScratch.z, false)
  }
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
    rig.minDistance = CAMERA_LIMITS.minDistance
    rig.maxDistance = CAMERA_LIMITS.maxDistance
    window.__twinRig = rig
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
      rig.setBoundary(
        new Box3(new Vector3(-500, CAMERA_LIMITS.minTargetY, -500), new Vector3(500, 240, 500)),
      )
      return
    }
    const pose = CAMERA_POSES[cam]
    if (perspective.isPerspectiveCamera && perspective.fov !== pose.fov) {
      perspective.fov = pose.fov
      perspective.updateProjectionMatrix()
    }
    rig.maxPolarAngle = Math.PI
    void rig.setLookAt(
      pose.position[0],
      pose.position[1],
      pose.position[2],
      pose.target[0],
      pose.target[1],
      pose.target[2],
      false,
    )
    rig.update(0)
    rig.setBoundary(
      new Box3(new Vector3(-500, CAMERA_LIMITS.minTargetY, -500), new Vector3(500, 240, 500)),
    )
    applyCameraLimits(rig)
    rig.update(0)
  }, [bounds, cam, camera, size.height, size.width])

  useFrame(() => {
    const rig = controls.current
    if (!rig) return
    applyCameraLimits(rig)
  }, -2)

  return <CameraControls ref={controls} makeDefault smoothTime={0} />
}
