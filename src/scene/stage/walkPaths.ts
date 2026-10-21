import { Color, NormalBlending, type Blending } from 'three'
import type { Alarm, Device } from '../../types'
import { getFloorPlan } from '../../floors/cache'
import { alarmPointsOnFloor, heatColorForCount, type AlarmPoint } from './zoneHeat'

/**
 * 走廊人流路径。只读既有 walkPaths 和告警落点，不改热力计数。
 * 0 密度不用热力绿，避免和 ZoneHeat 铺色叠成一块。
 */

export const WALK_PATH_BASE = '#8ea4b8'
export const WALK_PATH_OPACITY = 0.36
/** 高于热力 0.2，仍贴在桌面（约 0.76）以下。 */
export const WALK_PATH_LIFT = 0.26
/** 热力 1，房间标签 3。路径夹在中间。 */
export const WALK_PATH_ORDER = 2
export const WALK_PATH_WIDTH = 2
export const WALK_PATH_DASHED = true
export const WALK_DASH_SIZE = 0.65
export const WALK_GAP_SIZE = 0.42
export const WALK_PATH_POLYGON_OFFSET = -2
export const WALK_PATH_BLENDING: Blending = NormalBlending
/** 沿路径采样的半径（米）。不参与区域内告警归类。 */
export const WALK_OCCUPANCY_RADIUS_M = 3.2

const BASE_COLOR = new Color(WALK_PATH_BASE)
const BASE_TUPLE: [number, number, number] = [BASE_COLOR.r, BASE_COLOR.g, BASE_COLOR.b]
const heatTuples = new Map<string, [number, number, number]>()
const NO_PATHS: Array<Array<[number, number]>> = []
const NO_ALARMS: readonly Alarm[] = []
const NO_DEVICES: readonly Device[] = []

type XZ = { readonly x: number; readonly z: number } | readonly [number, number]

export interface WalkPathPref {
  visible: boolean
  occupancy: boolean
}

export interface WalkGeometryCache {
  key: string
  floorId: string
  paths: readonly (readonly XZ[])[] | undefined
  lines: Array<Array<[number, number, number]>>
}

export interface WalkSampleCache {
  floorId: string
  alarms: readonly Alarm[]
  devices: readonly Device[]
  points: AlarmPoint[]
}

export interface WalkColorCache {
  key: string
  samples: readonly AlarmPoint[] | null
  geometryKey: string
  colors: Array<Array<[number, number, number]>> | null
}

const DEFAULT_PREF: WalkPathPref = { visible: true, occupancy: true }
let pref: WalkPathPref = { ...DEFAULT_PREF }
const listeners = new Set<() => void>()

export function walkPathPref(): WalkPathPref {
  return pref
}

export function subscribeWalkPathPref(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setWalkPathPref(patch: Partial<WalkPathPref>): void {
  const next = { ...pref, ...patch }
  if (next.visible === pref.visible && next.occupancy === pref.occupancy) return
  pref = next
  for (const listener of listeners) listener()
}

export function resetWalkPathPref(): void {
  pref = { ...DEFAULT_PREF }
  for (const listener of listeners) listener()
}

/** T044 若写入 layers.walkPaths，以它为准。没有这个字段就保持 null，走自带开关。 */
export function selectWalkLayer(state: object): boolean | null {
  const layers = (state as { layers?: Record<string, unknown> | null }).layers
  if (!layers || typeof layers !== 'object') return null
  return typeof layers.walkPaths === 'boolean' ? layers.walkPaths : null
}

export function readPlanPaths(floorId: string): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  return getFloorPlan(floorId)?.walkPaths ?? NO_PATHS
}

export function emptyWalkSamples(): WalkSampleCache {
  return { floorId: '', alarms: NO_ALARMS, devices: NO_DEVICES, points: [] }
}

function readXZ(point: XZ): [number, number] | null {
  if ('x' in point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null
    return [point.x, point.z]
  }
  const x = point[0]
  const z = point[1]
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null
  return [x, z]
}

export function walkPathsKey(floorId: string, paths: readonly (readonly XZ[])[] | undefined): string {
  let key = floorId
  if (!paths) return key
  for (const path of paths) {
    key += '#'
    for (const raw of path) {
      const xz = readXZ(raw)
      if (!xz) continue
      key += `${xz[0]},${xz[1]};`
    }
  }
  return key
}

/** 折线贴在局部 y=0，高度由组抬升。闭合环保留首尾重复点。 */
export function buildWalkPolylines(paths: readonly (readonly XZ[])[] | undefined): Array<Array<[number, number, number]>> {
  if (!paths) return []
  const lines: Array<Array<[number, number, number]>> = []
  for (const path of paths) {
    const points: Array<[number, number, number]> = []
    for (const raw of path) {
      const xz = readXZ(raw)
      if (!xz) continue
      points.push([xz[0], 0, xz[1]])
    }
    if (points.length >= 2) lines.push(points)
  }
  return lines
}

export function retainWalkPolylines(
  floorId: string,
  paths: readonly (readonly XZ[])[] | undefined,
  previous: WalkGeometryCache,
): WalkGeometryCache {
  if (previous.floorId === floorId && previous.paths === paths) return previous
  const key = walkPathsKey(floorId, paths)
  if (previous.key === key) return previous
  return { key, floorId, paths, lines: buildWalkPolylines(paths) }
}

export function countAlarmsNear(x: number, z: number, alarms: readonly AlarmPoint[], radius = WALK_OCCUPANCY_RADIUS_M): number {
  const radiusSq = radius * radius
  let count = 0
  for (const alarm of alarms) {
    const dx = alarm.x - x
    const dz = alarm.z - z
    if (dx * dx + dz * dz <= radiusSq) count += 1
  }
  return count
}

/** 0 用冷灰，避免空走廊再铺一层热力绿。有告警时直接读 heatColorForCount。 */
export function walkOccupancyColor(count: number): readonly [number, number, number] {
  if (count <= 0) return BASE_TUPLE
  const hex = heatColorForCount(count)
  let tuple = heatTuples.get(hex)
  if (!tuple) {
    const color = new Color(hex)
    tuple = [color.r, color.g, color.b]
    heatTuples.set(hex, tuple)
  }
  return tuple
}

export function paintWalkOccupancy(
  lines: readonly (readonly (readonly [number, number, number])[])[],
  samples: readonly AlarmPoint[],
  radius = WALK_OCCUPANCY_RADIUS_M,
): Array<Array<[number, number, number]>> {
  return lines.map((line) =>
    line.map(([x, , z]) => {
      const color = walkOccupancyColor(countAlarmsNear(x, z, samples, radius))
      return [color[0], color[1], color[2]]
    }),
  )
}

function samplesKey(samples: readonly AlarmPoint[]): string {
  const parts = new Array<string>(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!
    parts[index] = `${sample.x},${sample.z}`
  }
  parts.sort()
  return parts.join('|')
}

export function retainWalkSamples(
  floorId: string,
  alarms: readonly Alarm[],
  devices: readonly Device[],
  previous: WalkSampleCache,
): WalkSampleCache {
  if (previous.floorId === floorId && previous.alarms === alarms && previous.devices === devices) return previous
  return { floorId, alarms, devices, points: alarmPointsOnFloor(floorId, alarms, devices) }
}

export function retainWalkColors(
  lines: readonly (readonly (readonly [number, number, number])[])[],
  samples: readonly AlarmPoint[],
  occupancy: boolean,
  geometryKey: string,
  previous: WalkColorCache,
): WalkColorCache {
  if (!occupancy) {
    if (previous.key === 'off') return previous
    return { key: 'off', samples: null, geometryKey, colors: null }
  }
  if (previous.colors && previous.samples === samples && previous.geometryKey === geometryKey) return previous
  const key = `on|${geometryKey}|${samplesKey(samples)}|${WALK_OCCUPANCY_RADIUS_M}`
  if (previous.key === key && previous.colors) return previous
  return { key, samples, geometryKey, colors: paintWalkOccupancy(lines, samples) }
}
