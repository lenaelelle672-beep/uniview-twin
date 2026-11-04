import { listFloorSpecs } from '../data/floors'
import { SENSOR_CLOUD_CAP, SENSOR_POINT_XZ, sensorPointY, type SensorFloorInput } from './plan'

export type Rgb = readonly [number, number, number]

export function sensorAlarmKey(floors: readonly SensorFloorInput[]): string {
  const alarms = new Map<string, number>()
  for (const floor of floors) alarms.set(floor.id, floor.alarmCount)
  let key = ''
  for (const spec of listFloorSpecs()) {
    const count = alarms.get(spec.id) ?? 0
    key += `${spec.id}:${count},`
  }
  return key
}

export function sensorAlarmFloorCount(floors: readonly SensorFloorInput[]): number {
  const alarms = new Map<string, number>()
  for (const floor of floors) alarms.set(floor.id, floor.alarmCount)
  let count = 0
  for (const spec of listFloorSpecs()) {
    if ((alarms.get(spec.id) ?? 0) > 0) count += 1
  }
  return count
}

/**
 * 把固定点位写入已有的缓冲。返回实际颗数，不超过 cap，也不超过缓冲长度。
 * 告警再多，一层也只占 SENSOR_POINTS_PER_FLOOR 颗。
 */
export function writeSensorCloud(
  positions: Float32Array,
  colors: Float32Array,
  floors: readonly SensorFloorInput[],
  progress: number,
  sensorRgb: Rgb,
  alarmRgb: Rgb,
): number {
  const alarms = new Map<string, number>()
  for (const floor of floors) alarms.set(floor.id, floor.alarmCount)
  const room = Math.min(positions.length, colors.length) / 3
  const specs = listFloorSpecs()
  let count = 0
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]
    if (!spec) break
    const floorAlarm = (alarms.get(spec.id) ?? 0) > 0
    const y = sensorPointY(spec.elevation, spec.height, index, progress)
    for (let slot = 0; slot < SENSOR_POINT_XZ.length; slot += 1) {
      if (count >= SENSOR_CLOUD_CAP || count >= room) return count
      const place = SENSOR_POINT_XZ[slot]
      if (!place) break
      // 两侧是传感器，中间一颗才吃告警色。一层再多告警也不加颗数。
      const rgb = floorAlarm && slot === 1 ? alarmRgb : sensorRgb
      const offset = count * 3
      positions[offset] = place[0]
      positions[offset + 1] = y
      positions[offset + 2] = place[1]
      colors[offset] = rgb[0]
      colors[offset + 1] = rgb[1]
      colors[offset + 2] = rgb[2]
      count += 1
    }
  }
  return count
}

/** 爆炸进度变了只改 Y。X/Z 和颜色不动。 */
export function writeSensorLift(positions: Float32Array, count: number, progress: number): void {
  const specs = listFloorSpecs()
  let written = 0
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]
    if (!spec) break
    const y = sensorPointY(spec.elevation, spec.height, index, progress)
    for (let place = 0; place < SENSOR_POINT_XZ.length; place += 1) {
      if (written >= count) return
      positions[written * 3 + 1] = y
      written += 1
    }
  }
}
