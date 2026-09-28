import type { Presentation } from '../store/viewSlice'
import { CAMERA_IDS, QUALITY_TIERS, VIEW_MODES, type CameraId, type QualityTier, type ViewMode } from '../types'
import { isFloorId } from '../data/floors'
import { isLocalDataPath } from '../data/adapters'
import { useTwinStore } from '../store/store'

const POS_RE = /^(?:B1|F(?:[1-9]|1\d|2[0-2]))-\d{1,4}$/

export interface UrlState {
  view?: ViewMode
  floor?: string
  pos?: string
  cam?: CameraId
  data?: string
  q?: QualityTier
  style?: Presentation
}

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
  if (pos && POS_RE.test(pos)) result.pos = pos

  const cam = params.get('cam')
  if (cam && isCameraId(cam)) result.cam = cam

  const data = params.get('data')
  if (data) result.data = data

  const quality = params.get('q')
  if (quality && isQuality(quality)) result.q = quality

  if (params.get('style') === 'model') result.style = 'model'

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
    q: state.qualityPinned ? state.quality : undefined,
    style: state.presentation === 'model' ? 'model' : undefined,
  })
}

export function applySearchToStore(search: string) {
  const parsed = parseSearch(search)
  const dataUrl = parsed.data ?? null
  useTwinStore.setState({
    view: parsed.view ?? 'building',
    selectedFloor: parsed.floor ?? null,
    focusedDeskId: parsed.pos ?? null,
    cam: parsed.cam ?? null,
    dataUrl,
    quality: parsed.q ?? 'balanced',
    qualityPinned: parsed.q != null,
    presentation: parsed.style ?? 'lit',
    error: dataUrl && !isLocalDataPath(dataUrl) ? '数据地址必须是以 / 开头的站内路径' : null,
    status: dataUrl && !isLocalDataPath(dataUrl) ? 'error' : useTwinStore.getState().status,
  })
}
