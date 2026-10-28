/**
 * T081：同源多标签薄总线的白名单。
 * 只承认 focus、视角令牌、alarmId、图层。不装整份 store。
 * 视角令牌和 T049 的 `?vp=` 是同一串数字，但这里只在已打开的同源标签之间接力，
 * 不写剪贴板，也不拼分享链接。
 */

export const BUS_CHANNEL = 'uniview-twin'

export const BUS_TYPES = ['focus', 'vp', 'alarmId', 'layer'] as const
export type BusType = (typeof BUS_TYPES)[number]

export const LAYER_KEYS = [
  'people',
  'labels',
  'heat',
  'outlines',
  'badges',
  'edges',
  'wireframe',
  'plaques',
  'decals',
  'segments',
  'tourPath',
  'screenVideo',
] as const
export type BusLayerKey = (typeof LAYER_KEYS)[number]

export type BusView = 'building' | 'floor' | 'blueprint'
export type BusCam = 'photo1' | 'p2f000' | 'p2f001' | 'p2f002' | 'p2f003' | 'east'

export interface FocusBody {
  t: 'focus'
  floor: string
  deskId: string | null
  deviceId: string | null
}

export interface VpBody {
  t: 'vp'
  token: string
  view: BusView
  floor: string | null
  cam: BusCam | null
  pos: string | null
}

export interface AlarmBody {
  t: 'alarmId'
  alarmId: string
  floor: string
  deskId: string | null
  deviceId: string | null
}

export interface LayerBody {
  t: 'layer'
  key: BusLayerKey
  on: boolean
}

export type BusBody = FocusBody | VpBody | AlarmBody | LayerBody

export interface BusSnapshot {
  focusSeq: number
  vpSeq: number
  floor: string | null
  deskId: string | null
  deviceId: string | null
  vp: string | null
  view: BusView
  cam: BusCam | null
  alarmId: string | null
  layers: Record<BusLayerKey, boolean>
}

export interface BusInput {
  focusSeq: number
  vpSeq: number
  floor: string | null
  deskId: string | null
  deviceId: string | null
  vp: string | null
  view: string
  cam: string | null
  alarmId: string | null
  layers: object
}

const VIEWS = new Set<BusView>(['building', 'floor', 'blueprint'])
const CAMS = new Set<BusCam>(['photo1', 'p2f000', 'p2f001', 'p2f002', 'p2f003', 'east'])
const LAYER_SET = new Set<string>(LAYER_KEYS)
const FLOOR_ID = /^(?:B1|F(?:[1-9]|1[0-9]|2[0-2]))$/
const ID_TEXT = /^[A-Za-z0-9-]{1,64}$/
const SEEN_LIMIT = 32

const TYPE_KEYS: Record<BusType, readonly string[]> = {
  focus: ['v', 'id', 'from', 't', 'floor', 'deskId', 'deviceId'],
  vp: ['v', 'id', 'from', 't', 'token', 'view', 'floor', 'cam', 'pos'],
  alarmId: ['v', 'id', 'from', 't', 'alarmId', 'floor', 'deskId', 'deviceId'],
  layer: ['v', 'id', 'from', 't', 'key', 'on'],
}

export function busWanted(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('bus') !== '0'
}

function searchOfHref(href: string): string {
  const queryAt = href.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = href.indexOf('#', queryAt)
  return hashAt < 0 ? href.slice(queryAt) : href.slice(queryAt, hashAt)
}

function navigationName(): string | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
  const entry = performance.getEntriesByType('navigation')[0] as { name?: string } | undefined
  return entry?.name ?? null
}

/**
 * 当前地址或启动导航里出现 `bus=0` 就关掉。
 * 地址栏同步会抹掉这个未知参数，启动导航记录仍保留第一次打开的地址。
 */
export function initialBusWanted(search: string, navigationHref?: string | null): boolean {
  if (!busWanted(search)) return false
  const href = navigationHref === undefined ? navigationName() : navigationHref
  if (!href) return true
  return busWanted(searchOfHref(href))
}

export function createTabId(seed = Math.random()): string {
  const whole = Math.floor(Math.abs(seed) * 2_176_782_336) % 2_176_782_336
  return `t${whole.toString(36)}`
}

export function isBusFloor(value: string | null | undefined): value is string {
  return typeof value === 'string' && FLOOR_ID.test(value)
}

export function isLayerKey(value: string): value is BusLayerKey {
  return LAYER_SET.has(value)
}

/** 与 T049 令牌同一套数字规则。带 `?` / `=` 的分享链接字符串直接丢掉。 */
export function acceptViewpointToken(raw: string): string | null {
  if (!raw || raw.length > 160 || /[?=&]/.test(raw)) return null
  const parts = raw.split('~')
  if (parts.length !== 7 && parts.length !== 10) return null
  const nums: number[] = []
  for (const part of parts) {
    if (!/^-?\d+(\.\d+)?$/.test(part)) return null
    const value = Number(part)
    if (!Number.isFinite(value)) return null
    nums.push(value)
  }
  const fov = nums[6] ?? 0
  if (fov < 5 || fov > 120) return null
  if (nums.some((value, index) => index !== 6 && Math.abs(value) > 5000)) return null
  return raw
}

function cleanId(value: string | null): string | null {
  if (!value) return null
  return ID_TEXT.test(value) ? value : null
}

function asView(value: string): BusView {
  return VIEWS.has(value as BusView) ? (value as BusView) : 'building'
}

function asCam(value: string | null): BusCam | null {
  if (!value) return null
  return CAMS.has(value as BusCam) ? (value as BusCam) : null
}

export function projectBusState(input: BusInput): BusSnapshot {
  const source = input.layers as Partial<Record<BusLayerKey, boolean>>
  const layers = {} as Record<BusLayerKey, boolean>
  for (const key of LAYER_KEYS) layers[key] = source[key] === true
  const floor = isBusFloor(input.floor) ? input.floor : null
  const vp = input.vp ? acceptViewpointToken(input.vp) : null
  return {
    focusSeq: Number.isFinite(input.focusSeq) ? input.focusSeq : 0,
    vpSeq: Number.isFinite(input.vpSeq) ? input.vpSeq : 0,
    floor,
    deskId: cleanId(input.deskId),
    deviceId: cleanId(input.deviceId),
    vp,
    view: asView(input.view),
    cam: asCam(input.cam),
    alarmId: cleanId(input.alarmId),
    layers,
  }
}

export function alarmIdFor(
  deviceId: string | null,
  alarms: readonly { id: string; deviceId: string }[],
): string | null {
  if (!deviceId) return null
  for (const alarm of alarms) {
    if (alarm.deviceId === deviceId && ID_TEXT.test(alarm.id)) return alarm.id
  }
  return null
}

/** 一次 store 写入最多一条事实。视角优先于焦点，避免对端 focus 把刚接力的令牌清掉。 */
export function diffWhitelist(prev: BusSnapshot, next: BusSnapshot): BusBody[] {
  if (prev.vpSeq !== next.vpSeq && next.vp) {
    return [
      {
        t: 'vp',
        token: next.vp,
        view: next.view,
        floor: next.floor,
        cam: next.cam,
        pos: next.deskId,
      },
    ]
  }
  if (prev.focusSeq !== next.focusSeq && next.floor) {
    if (next.alarmId) {
      return [
        {
          t: 'alarmId',
          alarmId: next.alarmId,
          floor: next.floor,
          deskId: next.deskId,
          deviceId: next.deviceId,
        },
      ]
    }
    return [
      {
        t: 'focus',
        floor: next.floor,
        deskId: next.deskId,
        deviceId: next.deviceId,
      },
    ]
  }
  if (prev.alarmId !== next.alarmId && next.alarmId && next.floor && prev.focusSeq === next.focusSeq) {
    return [
      {
        t: 'alarmId',
        alarmId: next.alarmId,
        floor: next.floor,
        deskId: next.deskId,
        deviceId: next.deviceId,
      },
    ]
  }
  const layers: LayerBody[] = []
  for (const key of LAYER_KEYS) {
    if (prev.layers[key] === next.layers[key]) continue
    layers.push({ t: 'layer', key, on: next.layers[key] })
  }
  return layers
}

export function rememberId(seen: readonly string[], id: string, limit = SEEN_LIMIT): string[] {
  if (seen.includes(id)) return seen.slice()
  const next = seen.length >= limit ? seen.slice(seen.length - limit + 1) : seen.slice()
  next.push(id)
  return next
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function sameKeys(raw: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(raw)
  if (present.length !== keys.length) return false
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(raw, key)) return false
  return true
}

function nullableId(value: unknown): string | null | undefined {
  if (value == null) return null
  if (typeof value !== 'string' || !ID_TEXT.test(value)) return undefined
  return value
}

function wireId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80) return null
  if (!/^[A-Za-z0-9:-]+$/.test(value)) return null
  return value
}

export interface AcceptedBus {
  id: string
  body: BusBody
}

/** 环回（同一 tab）和已经见过的 id 都丢掉。白名单以外的字段整包拒绝。 */
export function parseWire(raw: unknown, tabId: string, seen: readonly string[]): AcceptedBus | null {
  const record = asRecord(raw)
  if (!record || record.v !== 1) return null
  const id = wireId(record.id)
  const from = wireId(record.from)
  if (!id || !from || from === tabId || seen.includes(id)) return null
  if (typeof record.t !== 'string' || !BUS_TYPES.includes(record.t as BusType)) return null
  const type = record.t as BusType
  if (!sameKeys(record, TYPE_KEYS[type])) return null
  const body = parseBody(type, record)
  if (!body) return null
  return { id, body }
}

function parseBody(type: BusType, raw: Record<string, unknown>): BusBody | null {
  if (type === 'layer') {
    if (typeof raw.key !== 'string' || !isLayerKey(raw.key) || typeof raw.on !== 'boolean') return null
    return { t: 'layer', key: raw.key, on: raw.on }
  }
  if (type === 'vp') {
    if (typeof raw.token !== 'string' || typeof raw.view !== 'string') return null
    const token = acceptViewpointToken(raw.token)
    if (!token || !VIEWS.has(raw.view as BusView)) return null
    let floor: string | null
    if (raw.floor == null) floor = null
    else if (typeof raw.floor === 'string' && isBusFloor(raw.floor)) floor = raw.floor
    else return null
    const cam = raw.cam == null ? null : asCam(typeof raw.cam === 'string' ? raw.cam : null)
    if (raw.cam != null && cam == null) return null
    const pos = nullableId(raw.pos)
    if (pos === undefined) return null
    return { t: 'vp', token, view: raw.view as BusView, floor, cam, pos }
  }
  const floor = typeof raw.floor === 'string' && isBusFloor(raw.floor) ? raw.floor : null
  const deskId = nullableId(raw.deskId)
  const deviceId = nullableId(raw.deviceId)
  if (!floor || deskId === undefined || deviceId === undefined) return null
  if (type === 'alarmId') {
    const alarmId = nullableId(raw.alarmId)
    if (!alarmId) return null
    return { t: 'alarmId', alarmId, floor, deskId, deviceId }
  }
  return { t: 'focus', floor, deskId, deviceId }
}
