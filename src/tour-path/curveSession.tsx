import { useEffect, useMemo, useRef } from 'react'
import { CurveModifier, type CurveModifierRef } from '@react-three/drei/core/CurveModifier'
import { useThree } from '@react-three/fiber'
import { CatmullRomCurve3, Vector3 } from 'three'
import { TOUR_CURVE, TOUR_TENSION_CAP } from './caps'
import { browserCurveClock, startCurveAutoInvalidate } from './curveDrive'
import { tourPreviewPoints } from './path'

/**
 * T128：导览会话里用 drei CurveModifier 让一只巡游体沿现有 TourPath 走。
 * 组件只负责 createPortal 进 Flow 的那只网格。时间由会话里的 moveAlongCurve + autoInvalidate 推进。
 * 会话结束卸掉网格，并停掉要帧。
 */

const BODY_COLOR = '#ffb020'
const BODY_SIZE: [number, number, number] = [1.2, 2.2, 0.8]

interface PatrolState {
  active: boolean
  mounted: boolean
  driving: boolean
  offset: number
  points: number
  curve: 'centripetal'
}

let generation = 0
let stopDrive: (() => void) | null = null
let paintFrame: (() => void) | null = null

function silenceRaycast() {}

export function tourPatrolCurve(): CatmullRomCurve3 {
  const points = tourPreviewPoints()
  return new CatmullRomCurve3(
    points.map((point) => new Vector3(point[0], point[1], point[2])),
    false,
    TOUR_CURVE,
    TOUR_TENSION_CAP,
  )
}

function publish(partial: Partial<PatrolState>): void {
  const prev = window.__twinCurvePatrol
  const points = tourPreviewPoints().length
  window.__twinCurvePatrol = {
    active: partial.active ?? prev?.active ?? false,
    mounted: partial.mounted ?? prev?.mounted ?? false,
    driving: partial.driving ?? prev?.driving ?? false,
    offset: partial.offset ?? prev?.offset ?? 0,
    points: partial.points ?? prev?.points ?? points,
    curve: 'centripetal',
  }
}

function prepare(flow: CurveModifierRef): void {
  flow.uniforms.spineOffset.value = 0
  flow.uniforms.pathOffset.value = 0
  const root = flow.object3D
  root.name = 'TourPatrolBody'
  root.frustumCulled = false
  root.raycast = silenceRaycast
  root.traverse((child) => {
    child.frustumCulled = false
    child.raycast = silenceRaycast
  })
}

function paintUntilMounted(alive: () => boolean): void {
  const started = performance.now()
  const tick = () => {
    if (!alive()) return
    if (window.__twinSceneOverlayFlush?.()) return
    if (performance.now() - started > 8000) return
    window.setTimeout(tick, 50)
  }
  tick()
}

function CurvePatrolBody({ token }: { token: number }) {
  const get = useThree((state) => state.get)
  const curve = useMemo(() => tourPatrolCurve(), [])
  const ref = useRef<CurveModifierRef>(null)
  const mesh = useMemo(
    () => (
      <mesh
        name="TourPatrolBody"
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
        renderOrder={9}
        raycast={silenceRaycast}
      >
        <boxGeometry args={BODY_SIZE} />
        <meshBasicMaterial color={BODY_COLOR} fog={false} toneMapped={false} />
      </mesh>
    ),
    [],
  )
  useEffect(() => {
    if (token !== generation) return
    const flow = ref.current
    if (!flow) return
    prepare(flow)
    const invalidate = () => {
      if (token !== generation) return
      get().invalidate()
    }
    paintFrame = invalidate
    const stop = startCurveAutoInvalidate(flow, () => {
      if (token !== generation) return
      publish({
        active: true,
        mounted: true,
        driving: true,
        offset: flow.uniforms.pathOffset.value,
      })
      invalidate()
    }, browserCurveClock())
    stopDrive = stop
    publish({
      active: true,
      mounted: true,
      driving: true,
      offset: flow.uniforms.pathOffset.value,
    })
    return () => {
      stop()
      if (stopDrive === stop) stopDrive = null
      if (paintFrame === invalidate) paintFrame = null
      publish({ driving: false, mounted: false })
    }
  }, [get, token])
  return (
    <CurveModifier ref={ref} curve={curve}>
      {mesh}
    </CurveModifier>
  )
}

/** 导览会话已经开始才调用。取消或再次开始都会卸掉上一只。 */
export function startCurvePatrol(): { cancel: () => void } {
  const token = ++generation
  stopDrive?.()
  stopDrive = null
  paintFrame = null
  const alive = () => generation === token
  const cancel = () => {
    if (!alive()) return
    generation += 1
    const paint = paintFrame
    stopDrive?.()
    stopDrive = null
    paintFrame = null
    window.__twinCurvePatrolNode = null
    window.__twinSceneOverlayFlush?.()
    publish({ active: false, mounted: false, driving: false })
    paint?.()
  }
  window.__twinCurvePatrolNode = <CurvePatrolBody token={token} />
  publish({
    active: true,
    mounted: false,
    driving: false,
    offset: 0,
    points: tourPreviewPoints().length,
  })
  paintUntilMounted(alive)
  return { cancel }
}

export function resetCurvePatrolSessionForTests(): void {
  generation += 1
  stopDrive?.()
  stopDrive = null
  paintFrame = null
  if (typeof window !== 'undefined') {
    window.__twinCurvePatrolNode = null
    delete window.__twinCurvePatrol
  }
}
