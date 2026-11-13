import { CubicBezierLine } from '@react-three/drei/core/CubicBezierLine'
import { QuadraticBezierLine } from '@react-three/drei/core/QuadraticBezierLine'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  RELATION_CUBIC_COLOR,
  RELATION_LINE_WIDTH,
  RELATION_QUADRATIC_COLOR,
  RELATION_SEGMENTS,
  buildRelationArcs,
  readRelationBasis,
  sameRelationBasis,
  type RelationBasis,
} from './plan'
import { noteRelationMounted } from './probe'
import { useTwinStore } from '../store/store'

/** 拾取穿过弧，点选仍落到工位和设备。 */
function ignoreRaycast() {
  return null
}

/**
 * drei 10.7.9 里 LineProps.segments 是布尔（是否用线段），曲线的 segments 是分段数。
 * 两个类型交叉之后这个属性变成 never。运行时仍按数字分段。
 */
function curveSegments(): object {
  return { segments: RELATION_SEGMENTS }
}

/**
 * T125：少量静态二次 / 三次贝塞尔，把告警电脑连到它的告警圆标。
 * 控制点在 useMemo 里由一份快照生成一次。不注册逐帧回调，也不把点列拿去逐帧改。
 * 200ms 只复查圆标是否换了层或换了告警；矩阵亚毫米抖动沿用上一份点。
 */
export function RelationArcs() {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [basis, setBasis] = useState<RelationBasis | null>(null)

  useEffect(() => {
    let stop = false
    const pull = () => {
      if (stop) return
      const state = useTwinStore.getState()
      const next = readRelationBasis(scene, state.selectedFloor, state.devices, state.alarms)
      setBasis((prev) => (sameRelationBasis(prev, next) ? prev : next))
    }
    pull()
    const id = window.setInterval(pull, 200)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [scene])

  const arcs = useMemo(() => buildRelationArcs(basis), [basis])

  useLayoutEffect(() => {
    noteRelationMounted(arcs)
    if (arcs.length > 0) invalidate()
  }, [arcs, invalidate])

  useLayoutEffect(() => {
    return () => {
      noteRelationMounted([])
      invalidate()
    }
  }, [invalidate])

  if (arcs.length === 0) return null

  return (
    <group name="DeviceAlarmRelations">
      {arcs.map((arc) =>
        arc.kind === 'quadratic' ? (
          <QuadraticBezierLine
            key={`quadratic:${arc.alarmId}`}
            name={`RelationQuadratic-${arc.deviceId}`}
            start={arc.start}
            end={arc.end}
            mid={arc.mid}
            {...curveSegments()}
            color={RELATION_QUADRATIC_COLOR}
            lineWidth={RELATION_LINE_WIDTH}
            fog={false}
            transparent={false}
            toneMapped={false}
            depthTest
            depthWrite={false}
            renderOrder={7}
            frustumCulled={false}
            castShadow={false}
            receiveShadow={false}
            raycast={ignoreRaycast}
          />
        ) : (
          <CubicBezierLine
            key={`cubic:${arc.alarmId}`}
            name={`RelationCubic-${arc.deviceId}`}
            start={arc.start}
            end={arc.end}
            midA={arc.midA}
            midB={arc.midB}
            {...curveSegments()}
            color={RELATION_CUBIC_COLOR}
            lineWidth={RELATION_LINE_WIDTH}
            fog={false}
            transparent={false}
            toneMapped={false}
            depthTest
            depthWrite={false}
            renderOrder={7}
            frustumCulled={false}
            castShadow={false}
            receiveShadow={false}
            raycast={ignoreRaycast}
          />
        ),
      )}
    </group>
  )
}
