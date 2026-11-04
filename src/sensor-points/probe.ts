import {
  SENSOR_CLOUD_CAP,
  SENSOR_POINTS_LAYERS,
  SENSOR_POINTS_PER_FLOOR,
  SENSOR_SAMPLE_COUNT,
  type SensorPointsState,
} from './plan'

/** 开关分包和点云分包各写一份，状态只放在 window 上。 */
export function publishSensorPoints(patch: {
  on: boolean
  mounted: boolean
  state: SensorPointsState
  count?: number
  alarmFloors?: number
  sampled?: boolean
}): void {
  const prev = window.__twinSensorPoints
  window.__twinSensorPoints = {
    on: patch.on,
    mounted: patch.mounted,
    state: patch.state,
    impl: 'drei-Points+PointMaterial',
    modules: ['Points', 'PointMaterial'],
    count: patch.count ?? prev?.count ?? 0,
    cap: SENSOR_CLOUD_CAP,
    perFloor: SENSOR_POINTS_PER_FLOOR,
    alarmFloors: patch.alarmFloors ?? prev?.alarmFloors ?? 0,
    draws: 1,
    replacesBadges: false,
    dom: false,
    layers: SENSOR_POINTS_LAYERS,
    cdn: false,
    sampler: 'useSurfaceSampler',
    sampleOnce: true,
    sampleCount: SENSOR_SAMPLE_COUNT,
    sampled: patch.sampled ?? prev?.sampled ?? false,
    sampleSource: 'floor-plate',
  }
}
