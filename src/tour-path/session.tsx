import { MotionPathControls, useMotion } from '@react-three/drei/core/MotionPathControls'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { useTwinStore } from '../store/store'
import { TWIN_TOUR_EVENT, type TwinTourDetail } from '../viewmarks/tourEvents'
import { claimMotionCamera, releaseMotionCamera, type MotionClaim } from './latch'
import { alarmTourFloors, buildMotionRoute, readTourEye, type MotionRoute, type MotionSample } from './points'

/**
 * T071：DEMO / 导览播放时才挂 drei MotionPathControls。
 * loop 默认 false（drei 自己的默认是 true）。
 * 播放中每帧 invalidate 一次；停下就不再要帧，demand 回到原来的闸门。
 * 不进观众首屏，也不进均衡后处理那条包。
 */

const TAIL_SECONDS = 0.8

interface PlaySession {
  done: boolean
  mounted: boolean
  route: MotionRoute
  removePointer: () => void
}

let active: PlaySession | null = null

function emit(detail: TwinTourDetail): void {
  window.dispatchEvent(new CustomEvent(TWIN_TOUR_EVENT, { detail }))
}

function publish(next: NonNullable<Window['__twinMotionPath']>): void {
  window.__twinMotionPath = next
}

function rigOf(): MotionClaim | null {
  const rig = window.__twinRig
  if (!rig || typeof rig.update !== 'function' || typeof rig.setLookAt !== 'function') return null
  return rig as unknown as MotionClaim
}

function eyeNow(fallback: MotionSample): MotionSample {
  const position = window.__twinRig?.camera?.position
  if (!position) return fallback
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return fallback
  return { x: position.x, y: position.y, z: position.z }
}

function handBack(route: MotionRoute): void {
  const fallback = route.points[route.points.length - 1] ?? route.focus
  releaseMotionCamera(rigOf(), eyeNow(fallback), route.focus)
  window.__vpT = false
  publish({
    playing: false,
    owner: 'camera-controls',
    loop: route.loop,
    offset: 1,
    points: route.points.length,
    floors: route.floors,
    handedBack: true,
  })
}

function finish(session: PlaySession): void {
  if (session.done) return
  session.done = true
  if (active === session) active = null
  window.__twinTourMotionNode = null
  window.__twinSceneOverlayFlush?.()
  session.removePointer()
  window.__twinMotionPathIdle?.()
  if (!session.mounted) {
    handBack(session.route)
    emit({
      active: false,
      floorId: useTwinStore.getState().selectedFloor,
      empty: false,
    })
  }
}

function paint(node: PlaySession): void {
  const started = performance.now()
  const tick = () => {
    if (node.done || node.mounted) return
    if (window.__twinSceneOverlayFlush?.()) return
    if (performance.now() - started > 8000) return
    window.setTimeout(tick, 50)
  }
  tick()
}

function Driver({ route, session }: { route: MotionRoute; session: PlaySession }) {
  const motion = useMotion()
  const tail = useRef(0)
  const floorAt = useRef(-1)
  useFrame(() => {
    if (session.done) return
    claimMotionCamera(rigOf())
  }, -2)
  useFrame((state, delta) => {
    if (session.done) return
    const step = delta / route.seconds
    if (route.loop) motion.current += step
    else motion.current = Math.min(1, motion.current + step)
    const span = Math.max(1, route.floors.length)
    const index = Math.min(span - 1, Math.floor(Math.min(motion.current, 0.999999) * span))
    if (index !== floorAt.current) {
      floorAt.current = index
      emit({ active: true, floorId: route.floors[index] ?? null, empty: false })
    }
    publish({
      playing: true,
      owner: 'motion-path',
      loop: route.loop,
      offset: motion.offset,
      points: route.points.length,
      floors: route.floors,
      handedBack: false,
    })
    if (!route.loop && motion.current >= 1) {
      tail.current += delta
      if (motion.offset >= 0.997 || tail.current >= TAIL_SECONDS) {
        finish(session)
        return
      }
    }
    state.invalidate()
  }, 1)
  return null
}

function TourMotion({ route, session }: { route: MotionRoute; session: PlaySession }) {
  const invalidate = useThree((state) => state.invalidate)
  const focus = useMemo(
    () => [route.focus.x, route.focus.y, route.focus.z] as [number, number, number],
    [route.focus.x, route.focus.y, route.focus.z],
  )
  const curve = useMemo(() => {
    const points = route.points.map((point) => new Vector3(point.x, point.y, point.z))
    return new CatmullRomCurve3(points, false, 'catmullrom', 0.15)
  }, [route])
  const marks = useMemo(() => {
    const geometry = new SphereGeometry(2.2, 14, 10)
    const material = new MeshBasicMaterial({ color: '#e2a23b', depthTest: false })
    const meshes = route.points.map((point) => {
      const mesh = new Mesh(geometry, material)
      mesh.position.set(point.x, point.y, point.z)
      mesh.name = 'TourMotionPath'
      mesh.frustumCulled = false
      mesh.renderOrder = 20
      return mesh
    })
    const positions = new Float32Array(route.points.length * 3)
    route.points.forEach((point, index) => {
      positions[index * 3] = point.x
      positions[index * 3 + 1] = point.y
      positions[index * 3 + 2] = point.z
    })
    const lineGeometry = new BufferGeometry()
    lineGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    const line = new Line(lineGeometry, new LineBasicMaterial({ color: '#e2a23b', depthTest: false }))
    line.name = 'TourMotionPath'
    line.frustumCulled = false
    line.renderOrder = 20
    return { geometry, material, meshes, line, lineGeometry }
  }, [route])

  useLayoutEffect(() => {
    session.mounted = true
    window.__vpT = true
    window.__vpH = false
    claimMotionCamera(rigOf())
    publish({
      playing: true,
      owner: 'motion-path',
      loop: route.loop,
      offset: 0,
      points: route.points.length,
      floors: route.floors,
      handedBack: false,
    })
    invalidate()
    return () => {
      session.mounted = false
      marks.lineGeometry.dispose()
      const lineMaterial = marks.line.material
      if (!Array.isArray(lineMaterial)) lineMaterial.dispose()
      marks.geometry.dispose()
      marks.material.dispose()
      if (session.done && (active === null || active === session)) {
        handBack(route)
        emit({
          active: false,
          floorId: useTwinStore.getState().selectedFloor,
          empty: false,
        })
      } else if (!session.done) {
        releaseMotionCamera(rigOf(), eyeNow(route.points[0] ?? route.focus), route.focus)
      }
      invalidate()
    }
  }, [invalidate, marks, route, session])

  return (
    <group name="TourMotionPath">
      <primitive object={marks.line} />
      {marks.meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
      <MotionPathControls
        curves={[curve]}
        loop={route.loop}
        smooth={false}
        damping={0.12}
        focus={focus}
        focusDamping={0.18}
      >
        <Driver route={route} session={session} />
      </MotionPathControls>
    </group>
  )
}

/** 门已经打开、用户开始导览之后才调用。没有告警楼层时不挂沿轨。 */
export function startMotionPathTour(route?: MotionRoute | null): { cancel: () => void } {
  if (active && !active.done) {
    const previous = active
    previous.done = true
    previous.removePointer()
    if (active === previous) active = null
    window.__twinTourMotionNode = null
    window.__twinSceneOverlayFlush?.()
    if (!previous.mounted) window.__vpT = false
  }
  const next =
    route === undefined
      ? buildMotionRoute(alarmTourFloors(useTwinStore.getState().floors), readTourEye())
      : route
  if (!next) {
    active = null
    window.__vpT = false
    emit({ active: false, floorId: null, empty: true })
    publish({
      playing: false,
      owner: 'camera-controls',
      loop: false,
      offset: 0,
      points: 0,
      floors: [],
      handedBack: true,
    })
    window.__twinMotionPathIdle?.()
    return { cancel: () => {} }
  }

  let removePointer = () => {}
  const session: PlaySession = {
    done: false,
    mounted: false,
    route: next,
    removePointer: () => removePointer(),
  }
  const onPointer = (event: PointerEvent) => {
    const node = event.target
    if (node instanceof Element && node.closest('[data-viewmark-root]')) return
    finish(session)
  }
  window.addEventListener('pointerdown', onPointer, true)
  removePointer = () => window.removeEventListener('pointerdown', onPointer, true)

  active = session
  window.__vpT = true
  window.__vpH = false
  window.__twinTourMotionNode = <TourMotion route={next} session={session} />
  publish({
    playing: true,
    owner: 'motion-path',
    loop: next.loop,
    offset: 0,
    points: next.points.length,
    floors: next.floors,
    handedBack: false,
  })
  emit({ active: true, floorId: next.floors[0] ?? null, empty: false })
  paint(session)
  return {
    cancel: () => finish(session),
  }
}
