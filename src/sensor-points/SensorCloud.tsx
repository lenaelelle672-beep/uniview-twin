import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointMaterial } from '@react-three/drei/core/PointMaterial'
import { Points } from '@react-three/drei/core/Points'
import { Color, type Points as PointsImpl } from 'three'
import { useTwinStore } from '../store/store'
import { followSensorExplode } from './follow'
import { sensorAlarmFloorCount, sensorAlarmKey, writeSensorCloud } from './fill'
import { ALARM_COLOR, SENSOR_CLOUD_COUNT, SENSOR_COLOR, SENSOR_POINT_SIZE, SENSOR_SAMPLE_COUNT } from './plan'
import { publishSensorPoints } from './probe'
import { applySurfaceSamples, readSurfaceSample, surfaceSampleReady } from './sample'
import { SurfaceSample } from './SurfaceSample'

const sensorColor = new Color(SENSOR_COLOR)
const alarmColor = new Color(ALARM_COLOR)
const SENSOR_RGB = [sensorColor.r, sensorColor.g, sensorColor.b] as const
const ALARM_RGB = [alarmColor.r, alarmColor.g, alarmColor.b] as const

/** 拾取穿过点云，楼层单击仍打在外壳上。 */
function ignoreSensorPick() {
  // 不往 intersects 里推。
}

/**
 * T119：一整个 drei Points，材质是 drei PointMaterial。
 * T124：同一道门闩里先用 drei Sampler 把楼板表面采进缓冲，再喂给这个点云。
 * 不是每颗告警一个 mesh。圆标、房间标签、告警抽屉都不从这里走。
 * demand：告警数字变了才 invalidate。爆炸只改 Y，帧是外壳已经要来的。
 * 采样不在 useFrame 里。
 */
export function SensorCloud() {
  const invalidate = useThree((state) => state.invalidate)
  const alarmKey = useTwinStore((state) => sensorAlarmKey(state.floors))
  const pointsRef = useRef<PointsImpl>(null)
  const held = useRef({ progress: Number.NaN })
  const [sampleEpoch, setSampleEpoch] = useState(0)
  const noteSample = useCallback(() => {
    setSampleEpoch((value) => (value === 0 ? 1 : value))
  }, [])
  const buffers = useMemo(() => {
    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const colors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const progress = window.__twinExplode?.progress ?? 0
    const floors = useTwinStore.getState().floors
    writeSensorCloud(positions, colors, floors, progress, SENSOR_RGB, ALARM_RGB)
    held.current.progress = progress
    return { positions, colors }
  }, [alarmKey])

  useLayoutEffect(() => {
    const sampled = surfaceSampleReady()
    if (sampled) {
      applySurfaceSamples(buffers.positions, readSurfaceSample(), SENSOR_SAMPLE_COUNT, SENSOR_CLOUD_COUNT)
    }
    const geometry = pointsRef.current?.geometry
    const position = geometry?.getAttribute('position')
    const color = geometry?.getAttribute('color')
    if (position) position.needsUpdate = true
    if (color) color.needsUpdate = true
    const floors = useTwinStore.getState().floors
    publishSensorPoints({
      on: true,
      mounted: true,
      state: 'on',
      count: SENSOR_CLOUD_COUNT,
      alarmFloors: sensorAlarmFloorCount(floors),
      sampled,
    })
    invalidate()
  }, [alarmKey, buffers, invalidate, sampleEpoch])

  useLayoutEffect(() => {
    return () => {
      const prev = window.__twinSensorPoints
      const state = prev && prev.state !== 'on' ? prev.state : 'off-view'
      publishSensorPoints({ on: false, mounted: false, state, count: 0, alarmFloors: 0, sampled: false })
      invalidate()
    }
  }, [invalidate])

  useFrame(() => {
    followSensorExplode(
      buffers.positions,
      SENSOR_CLOUD_COUNT,
      held.current,
      pointsRef.current?.geometry?.getAttribute('position'),
      window.__twinExplode?.progress ?? 0,
    )
  })

  return (
    <>
      <SurfaceSample positions={buffers.positions} onSampled={noteSample} />
      <Points
      ref={pointsRef}
      name="SensorPoints"
      positions={buffers.positions}
      colors={buffers.colors}
      stride={3}
      frustumCulled={false}
      raycast={ignoreSensorPick}
    >
      <PointMaterial
        vertexColors
        transparent
        depthWrite={false}
        fog={false}
        size={SENSOR_POINT_SIZE}
        sizeAttenuation
        color="#ffffff"
      />
    </Points>
    </>
  )
}
