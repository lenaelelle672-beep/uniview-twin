import { CameraControls } from '@react-three/drei/core/CameraControls'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { Box3, Group, Object3D, PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_LIMITS, CAMERA_POSES, maxPolarAngleAboveGround } from '../../scene/cameras'
import { explodeOffset, FLOOR_COUNT } from '../../scene/explode'
import {
  USER_CAMERA_SMOOTH_TIME,
  clampControlDelta,
  sameCameraIntent,
  userCameraMove,
  type CameraSnap,
} from '../../scene/stage/cameraTransition'
import type { UserFlight } from '../../scene/stage/cameraMotion'
import { useTwinStore } from '../../store/store'

const targetScratch = new Vector3()
const positionScratch = new Vector3()
const endPositionScratch = new Vector3()
const endTargetScratch = new Vector3()
const movedScratch: Array<[Object3D, number]> = []

interface OrbitPose {
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
}

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

function applyCameraLimits(rig: CameraControls, maxDistance: number) {
  rig.minDistance = CAMERA_LIMITS.minDistance
  rig.maxDistance = maxDistance
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

function keepDemandTransition(rig: CameraControls) {
  const patched = rig as CameraControls & { __twinDeltaCap?: boolean }
  if (patched.__twinDeltaCap) return
  patched.__twinDeltaCap = true
  const raw = rig.update.bind(rig)
  rig.update = (delta: number) => raw(clampControlDelta(delta))
}

function poseOf(position: Vector3, target: Vector3): OrbitPose {
  return {
    px: position.x,
    py: position.y,
    pz: position.z,
    tx: target.x,
    ty: target.y,
    tz: target.z,
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
  const distanceCap = useRef(CAMERA_LIMITS.maxDistance)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const seenFrame = useRef(false)
  const gliding = useRef(false)
  const flight = useRef(0)
  const effectEpoch = useRef(0)
  const prevSnap = useRef<CameraSnap | null>(null)
  const flightHold = useRef<UserFlight | null>(null)
  const pumpRef = useRef(0)

  useLayoutEffect(() => {
    const nextSnap: CameraSnap = {
      view,
      cam,
      spread,
      width: size.width,
      height: size.height,
    }
    const previous = prevSnap.current
    prevSnap.current = nextSnap
    const presented = seenFrame.current || window.__twinFirstFrameAt != null
    const move = userCameraMove({ presented, prev: previous, next: nextSnap })
    const rig = controls.current

    const noteRested = () => {
      void import('../../scene/stage/cameraRest').then((mod) => {
        mod.markCameraRested('setLookAt')
      })
    }
    const stopGlide = () => {
      flight.current += 1
      gliding.current = false
      if (pumpRef.current) cancelAnimationFrame(pumpRef.current)
      pumpRef.current = 0
      flightHold.current?.cancel()
      flightHold.current = null
    }
    const releaseOnUnmount = (seen: number) => () => {
      queueMicrotask(() => {
        if (effectEpoch.current !== seen) return
        stopGlide()
        noteRested()
      })
    }

    // 机位没变时，fitGeneration / invalidate 会把效果重跑一遍。
    // 同步 cleanup 若在这里 setLookAt(false)，demand 下的过渡会在一两帧后被抄到终点。
    if (rig && sameCameraIntent(previous, nextSnap) && gliding.current) {
      effectEpoch.current += 1
      return releaseOnUnmount(effectEpoch.current)
    }

    const interrupted = gliding.current
    if (interrupted) stopGlide()
    if (!rig) return undefined

    effectEpoch.current += 1
    const seen = effectEpoch.current
    keepDemandTransition(rig)
    window.__twinRig = rig as unknown as Window['__twinRig']
    if (view === 'floor') {
      rig.setBoundary(undefined)
      if (interrupted) noteRested()
      return undefined
    }

    const perspective = camera as PerspectiveCamera
    const group = fitRef.current
    let start: OrbitPose | null = null
    if (move) {
      rig.getPosition(positionScratch, false)
      rig.getTarget(targetScratch, false)
      start = poseOf(positionScratch, targetScratch)
    }

    rig.minDistance = CAMERA_LIMITS.minDistance
    rig.maxDistance = CAMERA_LIMITS.maxDistance
    distanceCap.current = CAMERA_LIMITS.maxDistance
    rig.smoothTime = USER_CAMERA_SMOOTH_TIME

    let watching = false
    const launchGlide = (end: OrbitPose, reason: 'back-overview' | 'pose') => {
      if (!start) return
      const myFlight = ++flight.current
      const startDistance = Math.hypot(start.px - start.tx, start.py - start.ty, start.pz - start.tz)
      const endDistance = Math.hypot(end.px - end.tx, end.py - end.ty, end.pz - end.tz)
      rig.minDistance = Math.min(CAMERA_LIMITS.minDistance, 0.5)
      rig.maxDistance = Math.max(distanceCap.current, startDistance, endDistance)
      rig.maxPolarAngle = Math.PI
      rig.smoothTime = USER_CAMERA_SMOOTH_TIME
      // 先在绘制前回到起点。fitToBox 仍然用 enableTransition=false 量好终点。
      // 续帧模块是异步包，到之前用 rAF 把 demand 接上，避免空档把过渡吃完。
      void rig.setLookAt(start.px, start.py, start.pz, start.tx, start.ty, start.tz, false)
      gliding.current = true
      watching = true
      const pump = () => {
        if (flight.current !== myFlight) return
        invalidate()
        pumpRef.current = requestAnimationFrame(pump)
      }
      pumpRef.current = requestAnimationFrame(pump)
      void import('../../scene/stage/cameraMotion').then((mod) => {
        if (flight.current !== myFlight) return
        if (pumpRef.current) cancelAnimationFrame(pumpRef.current)
        pumpRef.current = 0
        const held = mod.beginUserCameraFlight({ rig, invalidate, reason })
        flightHold.current = held
        void rig.setLookAt(end.px, end.py, end.pz, end.tx, end.ty, end.tz, true).then(() => {
          if (flight.current !== myFlight) return
          held.settled()
          if (flightHold.current === held) flightHold.current = null
          gliding.current = false
          rig.minDistance = CAMERA_LIMITS.minDistance
          rig.maxDistance = distanceCap.current
          rig.smoothTime = USER_CAMERA_SMOOTH_TIME
          applyCameraLimits(rig, distanceCap.current)
          gl.shadowMap.needsUpdate = true
          invalidate()
        })
      })
    }

    if (!cam) {
      const bounds = group ? collapsedBounds(group) : null
      if (!bounds || bounds.isEmpty()) {
        if (interrupted) noteRested()
        return undefined
      }
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
      // 展开后的框比 maxDistance 能框住的高。先放开最远距离让 fitToBox 算够，
      // 再把这个距离当本次上限，否则每帧的限制会把相机拉回 maxDistance，顶层出画。
      if (spread) rig.maxDistance = Infinity
      void rig.fitToBox(bounds, false, {
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 8,
        paddingBottom: 6,
      })
      if (spread) distanceCap.current = Math.max(CAMERA_LIMITS.maxDistance, rig.distance)
      rig.maxDistance = distanceCap.current
      rig.maxPolarAngle = Math.PI
      rig.setBoundary(
        new Box3(new Vector3(-500, CAMERA_LIMITS.minTargetY, -500), new Vector3(500, 240, 500)),
      )
      if (start && move) {
        rig.getPosition(endPositionScratch, false)
        rig.getTarget(endTargetScratch, false)
        launchGlide(poseOf(endPositionScratch, endTargetScratch), move)
      }
      if (interrupted && !watching) noteRested()
      return watching ? releaseOnUnmount(seen) : undefined
    }

    const pose = CAMERA_POSES[cam]
    if (perspective.isPerspectiveCamera && perspective.fov !== pose.fov) {
      perspective.fov = pose.fov
      perspective.updateProjectionMatrix()
    }
    rig.maxPolarAngle = Math.PI
    rig.setBoundary(
      new Box3(new Vector3(-500, CAMERA_LIMITS.minTargetY, -500), new Vector3(500, 240, 500)),
    )
    const end = poseOf(
      new Vector3(pose.position[0], pose.position[1], pose.position[2]),
      new Vector3(pose.target[0], pose.target[1], pose.target[2]),
    )
    if (start && move) {
      launchGlide(end, move === 'back-overview' ? 'back-overview' : 'pose')
      return watching ? releaseOnUnmount(seen) : undefined
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
    rig.update(0)
    applyCameraLimits(rig, distanceCap.current)
    rig.update(0)
    if (interrupted) noteRested()
    return undefined
  }, [cam, camera, fitGeneration, fitRef, gl, invalidate, size.height, size.width, spread, view])

  useFrame(() => {
    seenFrame.current = true
    const rig = controls.current
    if (!rig || view === 'floor' || gliding.current) return
    applyCameraLimits(rig, distanceCap.current)
  }, -2)

  return <CameraControls ref={controls} makeDefault smoothTime={USER_CAMERA_SMOOTH_TIME} />
}
