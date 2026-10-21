import { Line } from '@react-three/drei/core/Line'
import { Html } from '@react-three/drei/web/Html'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Vector2, Vector3 } from 'three'
import { useTwinStore } from '../store/store'
import {
  bindMeasureEscape,
  createDragFramePump,
  createMeasureRaycaster,
  measureLabelText,
  measureLinePoints,
  isMeasureClick,
  measureSessionKey,
  placeMeasurePoint,
  pointerToNdc,
  previewMeasureEnd,
  raycastMeasurePoint,
  type MeasureSegment,
} from './measurePick'

function ignoreMeasureRaycast() {}

/**
 * 点到点测距。只在用户打开后挂上，所以 drei Line / Html 不进首屏。
 * 交互借 LengthMeasurement：单击起点，移动预览，再单击落点；Esc 退出。
 * 同时只保留一条线和一枚标签。再点一次就换成新的一段。
 */
export function MeasureTool() {
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const view = useTwinStore((state) => state.view)
  const floor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const [segment, setSegment] = useState<MeasureSegment | null>(null)
  const segmentRef = useRef<MeasureSegment | null>(null)
  segmentRef.current = segment
  const session = measureSessionKey(view, floor, exploded)
  const sessionRef = useRef(session)

  useEffect(() => {
    if (sessionRef.current === session) return
    sessionRef.current = session
    setSegment(null)
    window.__twinMeasureExit?.()
  }, [session])

  useEffect(() => bindMeasureEscape(() => window.__twinMeasureExit?.()), [])

  useEffect(() => {
    const dom = gl.domElement
    const raycaster = createMeasureRaycaster()
    const pointer = new Vector2()
    const pump = createDragFramePump(invalidate)
    const down = { x: 0, y: 0, armed: false }
    let suppressClick = false

    const cast = (event: PointerEvent) => {
      const ndc = pointerToNdc(event.clientX, event.clientY, dom.getBoundingClientRect(), pointer)
      if (!ndc) return null
      raycaster.setFromCamera(ndc, camera)
      return raycastMeasurePoint(raycaster, scene, gl.localClippingEnabled)
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.target !== dom) return
      down.x = event.clientX
      down.y = event.clientY
      down.armed = true
      suppressClick = false
      pump.start()
    }

    const onMove = (event: PointerEvent) => {
      const current = segmentRef.current
      if (!current || current.committed) return
      const point = cast(event)
      if (!point) return
      const next = previewMeasureEnd(current, point)
      if (next === current) return
      segmentRef.current = next
      setSegment(next)
      invalidate()
    }

    const onUp = (event: PointerEvent) => {
      const armed = down.armed
      const dx = event.clientX - down.x
      const dy = event.clientY - down.y
      down.armed = false
      pump.stop()
      if (!armed || event.button !== 0) return
      if (!isMeasureClick(dx, dy)) return
      // 测距打开时单击不该再选楼、进层或清掉当前层。
      suppressClick = true
      const point = cast(event)
      if (!point) return
      const next = placeMeasurePoint(segmentRef.current, point)
      if (next === segmentRef.current) return
      segmentRef.current = next
      setSegment(next)
      invalidate()
    }

    const stopClick = (event: MouseEvent) => {
      if (event.type !== 'dblclick' && !suppressClick) return
      suppressClick = false
      event.stopPropagation()
      event.preventDefault()
    }

    dom.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dom.addEventListener('click', stopClick, true)
    dom.addEventListener('dblclick', stopClick, true)
    return () => {
      pump.stop()
      dom.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dom.removeEventListener('click', stopClick, true)
      dom.removeEventListener('dblclick', stopClick, true)
    }
  }, [camera, gl, invalidate, scene])

  useEffect(() => {
    invalidate()
    return () => invalidate()
  }, [invalidate, segment])

  const pointsKey =
    segment?.end == null
      ? ''
      : `${segment.start.x.toFixed(4)},${segment.start.y.toFixed(4)},${segment.start.z.toFixed(4)}|${segment.end.x.toFixed(4)},${segment.end.y.toFixed(4)},${segment.end.z.toFixed(4)}`
  const points = useMemo(() => measureLinePoints(segment), [pointsKey])
  const labelAt = useMemo(() => {
    if (!points) return null
    return new Vector3().addVectors(points[0], points[1]).multiplyScalar(0.5)
  }, [points])
  const label = measureLabelText(segment)

  return (
    <group name="MeasureTool">
      {points ? (
        <Line
          points={points}
          color="#ffe14a"
          lineWidth={2.5}
          name="MeasureLine"
          renderOrder={4}
          frustumCulled={false}
          // 远距离草地的深度缓冲会盖住只抬高 4cm 的线。关掉深度测试后线画在场景上，DOM 仍盖在画布上。
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
          raycast={ignoreMeasureRaycast}
        />
      ) : null}
      {labelAt && label ? (
        <Html position={labelAt} center pointerEvents="none" zIndexRange={[2, 0]} className="measure-label">
          {label}
        </Html>
      ) : null}
    </group>
  )
}
