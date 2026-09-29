import { CameraControls } from '@react-three/drei/core/CameraControls'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Box3, Group, Object3D, PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_LIMITS, CAMERA_POSES, maxPolarAngleAboveGround } from '../../scene/cameras'
import { explodeOffset, FLOOR_COUNT } from '../../scene/explode'
import { useTwinStore } from '../../store/store'

const targetScratch = new Vector3()
const positionScratch = new Vector3()
const movedScratch: Array<[Object3D, number]> = []

export function FitBump({ onReady }: { onReady: () => void }) {
  useLayoutEffect(() => {
    onReady()
  }, [onReady])
  return null
}

/**
 * ExplodedLayout 只改各层 position.y，原值记在 userData.explodeRestY。
 * 按收拢位置量框，爆炸动画走到哪一步、量几次都得到同一个框，展开时再单独抬高框顶。
 */
function collapsedBounds(group: Group): Box3 {
  movedScratch.length = 0
  group.traverse((object) => {
    const rest = object.userData.explodeRestY
    if (typeof rest === 'number' && object.position.y !== rest) {
      movedScratch.push([object, object.position.y])
      object.position.y = rest
    }
  })
  const bounds = new Box3().setFromObject(group)
  for (const [object, y] of movedScratch) object.position.y = y
  if (movedScratch.length > 0) group.updateWorldMatrix(false, true)
  movedScratch.length = 0
  return bounds
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

export function CameraRig({
  fitRef,
  fitGeneration,
}: {
  fitRef: RefObject<Group | null>
  fitGeneration: number
}) {
  const cam = useTwinStore((state) => state.cam)
  const view = useTwinStore((state) => state.view)
  const exploded = useTwinStore((state) => state.exploded)
  const spread = view === 'building' && exploded
  const controls = useRef<CameraControls>(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  useLayoutEffect(() => {
    const perspective = camera as PerspectiveCamera
    const rig = controls.current
    const group = fitRef.current
    if (!rig) return
    window.__twinRig = rig as unknown as Window['__twinRig']
    if (view === 'floor') {
      rig.setBoundary(undefined)
      return
    }
    rig.smoothTime = 0
    rig.minDistance = CAMERA_LIMITS.minDistance
    rig.maxDistance = CAMERA_LIMITS.maxDistance
    if (!cam) {
      if (!group) return
      const bounds = collapsedBounds(group)
      if (bounds.isEmpty()) return
      // 展开后顶层和屋面抬高 explodeOffset(FLOOR_COUNT - 1, 1)，框顶跟着抬，散开的楼层都进画面。
      if (spread) bounds.max.y += explodeOffset(FLOOR_COUNT - 1, 1)
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
  }, [cam, camera, fitGeneration, fitRef, size.height, size.width, spread, view])

  useFrame(() => {
    const rig = controls.current
    if (!rig || view === 'floor') return
    applyCameraLimits(rig)
  }, -2)

  return <CameraControls ref={controls} makeDefault smoothTime={0} />
}
