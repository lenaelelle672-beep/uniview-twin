/**
 * T125：设备到告警标记的静态关系弧。
 * 只取当前层、有工位号的告警电脑，并且告警记录对得上。
 * 落点来自已经摆好的圆标（圆标自己走 workstationPosition），这里不读数据里的 x/z。
 * 顺序必须和 deviceBadges 一样：电脑、有工位号、按工位号数值排序。对不上就不画，避免弧接到别的工位。
 * 二次和三次交替，硬顶 RELATION_ARC_CAP。控制点只生成一次，不逐帧改。
 */

export const RELATION_ARC_CAP = 4
export const RELATION_LINE_WIDTH = 1.5
export const RELATION_SEGMENTS = 12

/** 桌面高度。弧的起点是设备，不是圆标。 */
export const RELATION_DEVICE_Y = 0.78
/** 与圆标 BADGE_Y 相同。弧的终点是这台设备的告警标记。 */
export const RELATION_ALARM_Y = 1.88
/** 侧向拱起。太小会贴成直线，太大像装饰。 */
export const RELATION_BOW = 0.46

export const RELATION_QUADRATIC_COLOR = '#ff4d4f'
export const RELATION_CUBIC_COLOR = '#e36a3a'

/** 与 STATUS_GLYPH.alarm.index 相同。圆标属性里 2 才是告警。 */
export const ALARM_GLYPH = 2

export const RELATION_ARC_SEPARATE = {
  tourPath: 'separate',
  measure: 'separate',
  walkPaths: 'separate',
  roomLabels: 'separate',
  batchSegments: 'separate',
} as const

export type RelationKind = 'quadratic' | 'cubic'

export interface RelationDevice {
  id: string
  floorId: string
  deskId?: string | null
  type: string
  status: string
}

export interface RelationAlarm {
  id: string
  deviceId: string
  floorId: string
}

export interface RestSample {
  x: number
  z: number
  status: number
}

interface DeskDevice extends RelationDevice {
  deskId: string
}

export interface RelationPair {
  index: number
  kind: RelationKind
  deviceId: string
  alarmId: string
  deskId: string
  x: number
  z: number
}

/** 运行时冻住。类型保持可交给 drei 的三元数组。 */
export type RelationPoint = [number, number, number]

export interface QuadraticArc {
  kind: 'quadratic'
  deviceId: string
  alarmId: string
  deskId: string
  start: RelationPoint
  end: RelationPoint
  mid: RelationPoint
}

export interface CubicArc {
  kind: 'cubic'
  deviceId: string
  alarmId: string
  deskId: string
  start: RelationPoint
  end: RelationPoint
  midA: RelationPoint
  midB: RelationPoint
}

export type RelationArc = QuadraticArc | CubicArc

export interface RelationBasis {
  floorId: string
  elements: readonly number[]
  pairs: readonly RelationPair[]
}

export type RelationArcState = 'on' | 'off-switch' | 'off-view' | 'off-explode' | 'off-station'

export interface RelationArcGate {
  view: string
  floorId: string | null
  switchOn: boolean
  exploded: boolean
  explodeProgress: number
  stationActive: boolean
  stationAnimating: boolean
  stationProgress: number
}

const NO_ARCS: readonly RelationArc[] = Object.freeze([])

export function relationKind(index: number): RelationKind {
  return index % 2 === 0 ? 'quadratic' : 'cubic'
}

/** 和 deviceBadges 同一套过滤、同一套排序。 */
export function deskDevices(floorId: string, devices: readonly RelationDevice[]): DeskDevice[] {
  const desks: DeskDevice[] = []
  for (const device of devices) {
    if (device.floorId !== floorId || device.type !== 'pc' || !device.deskId) continue
    desks.push(device as DeskDevice)
  }
  desks.sort((a, b) => a.deskId.localeCompare(b.deskId, 'en', { numeric: true }))
  return desks
}

/**
 * 圆标个数和电脑工位个数不一致时返回空，不靠序号去猜。
 * 设备状态、圆标字形、告警记录三者都要对上，才算一条关系。
 */
export function pairRelations(
  floorId: string,
  devices: readonly RelationDevice[],
  alarms: readonly RelationAlarm[],
  rests: readonly RestSample[],
): RelationPair[] {
  const desks = deskDevices(floorId, devices)
  if (desks.length === 0 || desks.length !== rests.length) return []
  const alarmByDevice = new Map<string, RelationAlarm>()
  for (const alarm of alarms) {
    if (alarm.floorId !== floorId || !alarm.deviceId || !alarm.id) continue
    if (!alarmByDevice.has(alarm.deviceId)) alarmByDevice.set(alarm.deviceId, alarm)
  }
  const pairs: RelationPair[] = []
  for (let index = 0; index < desks.length; index += 1) {
    const device = desks[index]
    const rest = rests[index]
    if (!device || !rest) continue
    if (device.status !== 'alarm' || rest.status !== ALARM_GLYPH) continue
    const alarm = alarmByDevice.get(device.id)
    if (!alarm) continue
    const slot = pairs.length
    pairs.push({
      index: slot,
      kind: relationKind(slot),
      deviceId: device.id,
      alarmId: alarm.id,
      deskId: device.deskId,
      x: rest.x,
      z: rest.z,
    })
    if (pairs.length >= RELATION_ARC_CAP) break
  }
  return pairs
}

function tuple(x: number, y: number, z: number): RelationPoint {
  const point: RelationPoint = [x, y, z]
  Object.freeze(point)
  return point
}

/** three 的列主序。只读快照，不写回矩阵。 */
export function transformPoint(elements: ArrayLike<number>, x: number, y: number, z: number): RelationPoint {
  return tuple(
    (elements[0] ?? 0) * x + (elements[4] ?? 0) * y + (elements[8] ?? 0) * z + (elements[12] ?? 0),
    (elements[1] ?? 0) * x + (elements[5] ?? 0) * y + (elements[9] ?? 0) * z + (elements[13] ?? 0),
    (elements[2] ?? 0) * x + (elements[6] ?? 0) * y + (elements[10] ?? 0) * z + (elements[14] ?? 0),
  )
}

/**
 * 由一次快照生成控制点。二次一条中点，三次两个控制点。
 * 返回的数组和每个点都冻住，调用方不能改。
 */
export function buildRelationArcs(basis: RelationBasis | null): readonly RelationArc[] {
  if (!basis || basis.pairs.length === 0) return NO_ARCS
  const arcs: RelationArc[] = []
  for (const pair of basis.pairs) {
    const side = pair.index % 2 === 0 ? 1 : -1
    const start = transformPoint(basis.elements, pair.x, RELATION_DEVICE_Y, pair.z)
    const end = transformPoint(basis.elements, pair.x, RELATION_ALARM_Y, pair.z)
    if (pair.kind === 'quadratic') {
      const mid = transformPoint(
        basis.elements,
        pair.x + side * RELATION_BOW,
        (RELATION_DEVICE_Y + RELATION_ALARM_Y) / 2,
        pair.z,
      )
      arcs.push(Object.freeze({ kind: 'quadratic', deviceId: pair.deviceId, alarmId: pair.alarmId, deskId: pair.deskId, start, end, mid }))
      continue
    }
    const midA = transformPoint(
      basis.elements,
      pair.x + side * RELATION_BOW,
      RELATION_DEVICE_Y + 0.32,
      pair.z + side * 0.14,
    )
    const midB = transformPoint(
      basis.elements,
      pair.x - side * 0.2,
      RELATION_ALARM_Y - 0.24,
      pair.z - side * 0.08,
    )
    arcs.push(
      Object.freeze({
        kind: 'cubic',
        deviceId: pair.deviceId,
        alarmId: pair.alarmId,
        deskId: pair.deskId,
        start,
        end,
        midA,
        midB,
      }),
    )
  }
  return Object.freeze(arcs)
}

function roundMilli(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** 亚毫米的矩阵噪声不算变化，避免 200ms 复查把点列换新。 */
export function relationBasisKey(basis: RelationBasis): string {
  let key = basis.floorId
  for (let index = 0; index < 16; index += 1) key += `|${roundMilli(basis.elements[index] ?? 0)}`
  for (const pair of basis.pairs) {
    key += `|${pair.kind}|${pair.deviceId}|${pair.alarmId}|${roundMilli(pair.x)}|${roundMilli(pair.z)}`
  }
  return key
}

export function sameRelationBasis(prev: RelationBasis | null, next: RelationBasis | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  return relationBasisKey(prev) === relationBasisKey(next)
}

interface StatusAttribute {
  getX: (index: number) => number
  count?: number
}

interface BadgeMeshLike {
  userData: { badgeFloorId?: unknown; badgeRests?: unknown }
  matrixWorld?: { elements?: ArrayLike<number> }
  updateWorldMatrix?: (updateParents: boolean, updateChildren: boolean) => void
  geometry?: { getAttribute?: (name: string) => StatusAttribute | undefined }
}

function isBadgeMesh(value: unknown): value is BadgeMeshLike {
  if (!value || typeof value !== 'object') return false
  const mesh = value as Partial<BadgeMeshLike>
  return mesh.userData != null
}

function restSamples(value: unknown, status: StatusAttribute): RestSample[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (typeof status.count === 'number' && status.count < value.length) return null
  const samples: RestSample[] = []
  for (let index = 0; index < value.length; index += 1) {
    const rest = value[index] as { x?: unknown; z?: unknown } | null
    if (!rest || typeof rest.x !== 'number' || typeof rest.z !== 'number') return null
    if (!Number.isFinite(rest.x) || !Number.isFinite(rest.z)) return null
    const glyph = status.getX(index)
    if (!Number.isFinite(glyph)) return null
    samples.push({ x: rest.x, z: rest.z, status: Math.round(glyph) })
  }
  return samples
}

export interface RelationScene {
  getObjectByName?: (name: string) => unknown
}

/**
 * 读圆标的世界矩阵和静止落点，抄成普通数字。
 * 之后矩阵再变，已经交出的点列也不跟着改。
 */
export function readRelationBasis(
  scene: RelationScene,
  floorId: string | null,
  devices: readonly RelationDevice[],
  alarms: readonly RelationAlarm[],
): RelationBasis | null {
  if (!floorId || !scene.getObjectByName) return null
  const found = scene.getObjectByName('DeviceBadges')
  if (!isBadgeMesh(found)) return null
  if (found.userData.badgeFloorId !== floorId) return null
  found.updateWorldMatrix?.(true, false)
  const elements = found.matrixWorld?.elements
  if (!elements || elements.length < 16) return null
  const status = found.geometry?.getAttribute?.('aStatus')
  if (!status || typeof status.getX !== 'function') return null
  const rests = restSamples(found.userData.badgeRests, status)
  if (!rests) return null
  const copied: number[] = []
  for (let index = 0; index < 16; index += 1) {
    const value = Number(elements[index])
    if (!Number.isFinite(value)) return null
    copied.push(value)
  }
  const pairs = pairRelations(floorId, devices, alarms, rests).map((pair) => Object.freeze(pair))
  return {
    floorId,
    elements: Object.freeze(copied),
    pairs: Object.freeze(pairs),
  }
}

export function relationArcState(gate: RelationArcGate): RelationArcState {
  if (!gate.switchOn) return 'off-switch'
  if (gate.view !== 'floor' || !gate.floorId) return 'off-view'
  if (gate.exploded || gate.explodeProgress > 0) return 'off-explode'
  if (gate.stationActive || gate.stationAnimating || gate.stationProgress > 0) return 'off-station'
  return 'on'
}

export function relationArcVisible(gate: RelationArcGate): boolean {
  return relationArcState(gate) === 'on'
}

/** `?relationArc=1` 才打开。缺省和其他值都关。 */
export function relationArcWanted(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('relationArc') === '1'
}

export function relationArcSearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 relationArc。开关分包晚于同步，所以也看启动地址。 */
export function relationArcOnAtBoot(live: string, navigationUrl: string): boolean {
  return relationArcWanted(live) || relationArcWanted(relationArcSearchOfUrl(navigationUrl))
}
