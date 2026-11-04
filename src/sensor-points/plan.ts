/**
 * T119：总览传感器 / 告警点云。
 * 点位是本地常量，一栋楼固定几颗，不按设备、工位或告警条数加长。
 * 颜色只读楼层 alarmCount：有告警的层用告警色，其余是安静传感器。
 * 不进单层，所以不和房间标签、设备圆标、告警 DOM 抢同一层表面。
 */

/** 与软阴影、云层、天幕同一道首帧后窗口。字面量写在这里，懒包不再去引那份模块。 */
export const SENSOR_POINTS_AFTER_FIRST_MS = 2600

/** 南立面外侧三颗，z 越过塔楼南缘。总览东南机位看得到，不靠西侧楼层徽标列。 */
export const SENSOR_POINT_XZ: readonly (readonly [number, number])[] = [
  [-12, 24],
  [0, 24],
  [12, 24],
]

/** 落在该层层高的中上段，避开楼板接缝。 */
export const SENSOR_Y_FRACTION = 0.62

export const SENSOR_POINTS_PER_FLOOR = SENSOR_POINT_XZ.length

/** 硬顶。楼层变多也只画到这里，不允许按告警条数往上加。 */
export const SENSOR_CLOUD_CAP = 96

export const SENSOR_CLOUD_COUNT = 23 * SENSOR_POINTS_PER_FLOOR

/** 安静传感器。圆点，比幕墙深一点，不是圆标的三角。 */
export const SENSOR_COLOR = '#7fafd6'

/** 与设备圆标的告警色同一个色值，形状和位置都不同。 */
export const ALARM_COLOR = '#ff4d4f'

/** 透视衰减下，总览机位大约十像素，层与层之间留得开缝。一整个点云一次绘制。 */
export const SENSOR_POINT_SIZE = 10

export const SENSOR_POINTS_LAYERS = {
  badges: 'separate',
  labels: 'separate',
  alarmDom: 'separate',
  explode: 'follow-y',
} as const

export interface SensorFloorInput {
  id: string
  alarmCount: number
}

export type SensorPointsState = 'on' | 'pending' | 'off-view' | 'off-switch'

export interface SensorPointsGate {
  view: string
  optOut: boolean
}

/**
 * 只在总览画。夜景、白模也画：这是告警感知，不是天光装饰。
 * 单层和蓝图关掉，把表面留给标签、圆标和告警抽屉。
 */
export function sensorPointsState(gate: SensorPointsGate, due: boolean): SensorPointsState {
  if (gate.optOut) return 'off-switch'
  if (gate.view !== 'building') return 'off-view'
  if (!due) return 'pending'
  return 'on'
}

export function sensorPointsVisible(gate: SensorPointsGate, due: boolean): boolean {
  return sensorPointsState(gate, due) === 'on'
}

export function sensorPointsChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= SENSOR_POINTS_AFTER_FIRST_MS
}

/** 窗口过了一次就一直算过。爆炸或 RenderProbe 删掉首帧标记时点云不闪掉。 */
export function sensorPointsDueLatched(
  latched: boolean,
  firstFrameAt: number | null | undefined,
  now: number,
): boolean {
  return latched || sensorPointsChunkDue(firstFrameAt, now)
}

/** `?sensorPoints=0` 关掉。其他值和缺省都按开。 */
export function sensorPointsOptOut(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('sensorPoints') === '0'
}

export function sensorPointsSearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 sensorPoints，开关分包又晚于同步加载，所以也看启动地址。 */
export function sensorPointsOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return sensorPointsOptOut(live) || sensorPointsOptOut(sensorPointsSearchOfUrl(navigationUrl))
}

/**
 * 与外壳 explodeOffset 同一条：净空 8 m、离地 6 m，进度 0 时为 0。
 * 不引用 explode.ts，懒包就不会把 maath 再打一份。单测锁住两边相等。
 */
export const SENSOR_EXPLODE_GAP_M = 8
export const SENSOR_EXPLODE_CLEARANCE_M = 6

export function sensorExplodeLift(index: number, progress: number): number {
  return (SENSOR_EXPLODE_CLEARANCE_M + index * SENSOR_EXPLODE_GAP_M) * progress
}

export function sensorPointY(elevation: number, height: number, index: number, progress: number): number {
  return elevation + height * SENSOR_Y_FRACTION + sensorExplodeLift(index, progress)
}
