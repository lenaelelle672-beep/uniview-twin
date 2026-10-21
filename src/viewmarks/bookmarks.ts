import { CAMERA_IDS, VIEW_MODES, type CameraId, type ViewMode } from '../types'
import { isFloorId } from '../data/floors'
import { parseViewpoint } from '../url/viewpoint'

export const VIEWMARK_LIMIT = 12
export const VIEWMARK_STORAGE_KEY = 'uniview-viewmarks-v1'

export interface Viewmark {
  id: string
  name: string
  token: string
  view: ViewMode
  floor: string | null
  cam: CameraId | null
  pos: string | null
}

export interface BookmarkStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

let idSeq = 0

export function createViewmarkId(now = Date.now()): string {
  idSeq += 1
  return `vm${now.toString(36)}${idSeq.toString(36)}`
}

function isViewMode(value: unknown): value is ViewMode {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value)
}

function isCameraId(value: unknown): value is CameraId {
  return typeof value === 'string' && (CAMERA_IDS as readonly string[]).includes(value)
}

function isViewmark(value: unknown): value is Viewmark {
  if (!value || typeof value !== 'object') return false
  const mark = value as Partial<Viewmark>
  if (typeof mark.id !== 'string' || !mark.id) return false
  if (typeof mark.name !== 'string' || !mark.name.trim() || mark.name.trim().length > 24) return false
  if (typeof mark.token !== 'string' || !parseViewpoint(mark.token)) return false
  if (!isViewMode(mark.view)) return false
  if (mark.floor != null && (typeof mark.floor !== 'string' || !isFloorId(mark.floor))) return false
  if (mark.cam != null && !isCameraId(mark.cam)) return false
  if (mark.pos != null && typeof mark.pos !== 'string') return false
  return true
}

export function loadBookmarks(storage: BookmarkStorage): Viewmark[] {
  try {
    const raw = storage.getItem(VIEWMARK_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .flatMap((value) => {
        if (!isViewmark(value)) return []
        return [{ ...value, floor: value.floor ?? null, cam: value.cam ?? null, pos: value.pos ?? null }]
      })
      .slice(0, VIEWMARK_LIMIT)
  } catch {
    return []
  }
}

export function saveBookmarks(storage: BookmarkStorage, marks: readonly Viewmark[]): boolean {
  try {
    storage.setItem(VIEWMARK_STORAGE_KEY, JSON.stringify(marks))
    return true
  } catch {
    return false
  }
}

export function rememberBookmark(
  marks: readonly Viewmark[],
  mark: Viewmark,
): { ok: true; marks: Viewmark[] } | { ok: false; reason: 'full' | 'name' | 'token' } {
  const name = mark.name.trim()
  if (!name || name.length > 24) return { ok: false, reason: 'name' }
  if (!parseViewpoint(mark.token)) return { ok: false, reason: 'token' }
  if (marks.length >= VIEWMARK_LIMIT) return { ok: false, reason: 'full' }
  return { ok: true, marks: [{ ...mark, name }, ...marks] }
}

export function forgetBookmark(marks: readonly Viewmark[], id: string): Viewmark[] {
  return marks.filter((mark) => mark.id !== id)
}
