import { useLayoutEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useTwinStore } from '../../store/store'
import { ZONE_HEAT_LIFT, ZONE_HEAT_ORDER, buildZoneHeatGeometry, createZoneHeatMaterial } from './zoneHeat'

/**
 * 进层后的单 mesh 热力。几何按告警数着顶点色。
 * frameloop=demand：挂上、告警变了、卸下都要 invalidate，否则停在上一帧。
 * 卸下时丢掉几何和材质，回总览不留这块网格。
 */
export function ZoneHeatMesh({ floorId }: { floorId: string }) {
  const liveAlarms = useTwinStore((state) => state.alarms)
  // 没有回放帧时仍走现网 alarms。有回放帧时把那一帧交给原来的几何函数。
  const playbackAlarms = useTwinStore((state) => state.alarmPlayback?.alarms)
  const alarms = playbackAlarms ?? liveAlarms
  const devices = useTwinStore((state) => state.devices)
  const invalidate = useThree((state) => state.invalidate)
  const geometry = useMemo(() => buildZoneHeatGeometry(floorId, alarms, devices), [alarms, devices, floorId])
  const material = useMemo(() => createZoneHeatMaterial(), [])

  useLayoutEffect(() => {
    invalidate()
    return () => {
      invalidate()
    }
  }, [geometry, invalidate])

  useLayoutEffect(() => {
    return () => {
      material.dispose()
    }
  }, [material])

  useLayoutEffect(() => {
    if (!geometry) return
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  if (!geometry) return null
  return (
    <mesh
      name="ZoneHeat"
      geometry={geometry}
      material={material}
      position={[0, ZONE_HEAT_LIFT, 0]}
      renderOrder={ZONE_HEAT_ORDER}
      raycast={() => null}
      castShadow={false}
      receiveShadow={false}
      dispose={null}
    />
  )
}
