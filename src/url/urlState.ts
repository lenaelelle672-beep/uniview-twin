import type { Presentation } from '../store/viewSlice'
import { CAMERA_IDS, QUALITY_TIERS, VIEW_MODES, type CameraId, type QualityTier, type ViewMode } from '../types'
import { isFloorId } from '../data/floors'
import { isLocalDataPath } from '../data/adapters'
import { invalidPosMessage, resolveWorkstationRef } from '../locate/ref'
import { useTwinStore } from '../store/store'

export interface UrlState {
  view?: ViewMode
  floor?: string
  pos?: string
  cam?: CameraId
  data?: string
  q?: QualityTier
  style?: Presentation
  keepDrawingBuffer?: boolean
  /** 已规范化的 `?vp=`。 */
  vp?: string
}

function keepDrawingBufferFromSearch(search: string): boolean {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('keepDrawingBuffer') === '1'
}

/** 地址栏往返保留测试参数；不进 store，避免和画质/机位挂钩。 */
let keepDrawingBufferFlag = typeof location !== 'undefined' && keepDrawingBufferFromSearch(location.search)

function isViewMode(value: string): value is ViewMode {
  return (VIEW_MODES as readonly string[]).includes(value)
}

function isQuality(value: string): value is QualityTier {
  return (QUALITY_TIERS as readonly string[]).includes(value)
}

function isCameraId(value: string): value is CameraId {
  return (CAMERA_IDS as readonly string[]).includes(value)
}

export function parseSearch(search: string): UrlState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const result: UrlState = {}

  const view = params.get('view')
  if (view && isViewMode(view)) result.view = view

  const floor = params.get('floor')
  if (floor && isFloorId(floor)) result.floor = floor

  const pos = params.get('pos')
  const resolvedPos = pos ? resolveWorkstationRef(pos) : null
  if (resolvedPos) result.pos = resolvedPos.deskId

  const cam = params.get('cam')
  if (cam && isCameraId(cam)) result.cam = cam

  const data = params.get('data')
  if (data) result.data = data

  const quality = params.get('q')
  if (quality && isQuality(quality)) result.q = quality

  if (params.get('style') === 'model') result.style = 'model'

  if (keepDrawingBufferFromSearch(search)) result.keepDrawingBuffer = true

  const acceptedVp = acceptVp(params.get('vp'))
  if (acceptedVp) result.vp = acceptedVp

  return result
}

export function serializeUrl(state: UrlState): string {
  const parts: Array<[string, string | undefined]> = [
    ['view', state.view && state.view !== 'building' ? state.view : undefined],
    ['floor', state.floor],
    ['pos', state.pos],
    ['cam', state.cam],
    ['data', state.data],
    ['q', state.q],
    ['style', state.style === 'model' ? 'model' : undefined],
    ['keepDrawingBuffer', state.keepDrawingBuffer ? '1' : undefined],
    ['vp', state.vp],
  ]
  const query = parts
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replace(/%2F/g, '/')}`)
    .join('&')
  return query ? `?${query}` : ''
}

export function storeToSearch(): string {
  const state = useTwinStore.getState()
  return serializeUrl({
    view: state.view,
    floor: state.selectedFloor ?? undefined,
    pos: state.focusedDeskId ?? undefined,
    cam: state.cam ?? undefined,
    data: state.dataUrl ?? undefined,
    q: state.urlQuality ?? undefined,
    style: state.presentation === 'model' ? 'model' : undefined,
    keepDrawingBuffer: keepDrawingBufferFlag || undefined,
    vp: state.vp ?? undefined,
  })
}

/** 首屏只做能挡住 `?vp=nope` 的检查。越界和小数格式由按需包再拦。 */
function acceptVp(raw: string | null): string | null {
  if (!raw) return null
  const parts = raw.split('~')
  const count = parts.length
  if (count !== 7 && count !== 10) return null
  const fov = +parts[6]
  if (!(fov >= 5 && fov <= 120)) return null
  for (let i = 0; i < count; i += 1) if (Number.isNaN(+parts[i])) return null
  return raw
}

function rawParam(search: string, key: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const value = params.get(key)
  if (!value || !value.trim()) return null
  return value.trim()
}

export function applySearchToStore(search: string) {
  keepDrawingBufferFlag = keepDrawingBufferFromSearch(search)
  const parsed = parseSearch(search)
  const dataUrl = parsed.data ?? null
  const rawPos = rawParam(search, 'pos')
  const located = rawPos ? resolveWorkstationRef(rawPos) : null
  if (typeof window !== 'undefined') window.__vpH = false
  useTwinStore.setState({
    view: parsed.view ?? 'building',
    selectedFloor: parsed.floor ?? null,
    focusedDeskId: null,
    focusedDeviceId: null,
    posNotice: rawPos && !located ? invalidPosMessage(rawPos) : null,
    cam: parsed.cam ?? null,
    dataUrl,
    quality: parsed.q ?? 'balanced',
    qualityPinned: parsed.q != null,
    urlQuality: parsed.q ?? null,
    downgradeSuppressed: false,
    presentation: parsed.style ?? 'lit',
    error: dataUrl && !isLocalDataPath(dataUrl) ? '数据地址必须是以 / 开头的站内路径' : null,
    status: dataUrl && !isLocalDataPath(dataUrl) ? 'error' : useTwinStore.getState().status,
    vp: null,
  })
  if (located) {
    useTwinStore.getState().focusDevice({ floor: located.floorId, deskId: located.deskId })
  }
  if (parsed.vp) {
    if (typeof window !== 'undefined') window.__vpH = true
    useTwinStore.setState({
      vp: parsed.vp,
      vpSeq: useTwinStore.getState().vpSeq + 1,
    })
    void import('../components/scene/vp')
  }
}
