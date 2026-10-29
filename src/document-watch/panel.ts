/**
 * T087：文档小窗里的告警列表和焦点卡。
 * 只创建文字节点。不创建画面、视频或脚本，也不读取主页面的样式表。
 */
import { WATCH_ROW_LIMIT } from './policy'

export interface WatchAlarmInput {
  id?: string
  floorId?: string
  deviceId?: string
  message?: string
}

export interface WatchFloorInput {
  id?: string
  name?: string
}

export interface WatchState {
  alarms?: readonly WatchAlarmInput[] | null
  floors?: readonly WatchFloorInput[] | null
  focusedDeviceId?: string | null
}

export interface WatchRow {
  id: string
  floorId: string
  floorName: string
  deviceId: string
  message: string
  focused: boolean
}

export interface WatchModel {
  card: WatchRow | null
  rows: WatchRow[]
  extra: number
  total: number
}

export interface WatchActions {
  onBack: () => void
  onFocus: (row: WatchRow) => void
}

export interface WatchNode {
  textContent: string
  setAttribute: (name: string, value: string) => void
  addEventListener: (type: string, listener: () => void) => void
  append: (...nodes: WatchNode[]) => void
  replaceChildren: (...nodes: WatchNode[]) => void
}

export interface WatchDocument {
  title: string
  head: { append: (...nodes: WatchNode[]) => void }
  body: { append: (...nodes: WatchNode[]) => void }
  createElement: (tag: string) => WatchNode
  querySelector?: (selector: string) => unknown
}

const PANEL_CSS = [
  'html,body{margin:0;background:#f4f7fb;color:#0c2340;font:13px/1.45 sans-serif}',
  'body{padding:10px}',
  '[data-document-watch]{display:flex;flex-direction:column;gap:8px}',
  '.dw-head{display:flex;align-items:center;gap:8px}',
  '[data-back]{margin-left:auto}',
  '[data-focus-card]{margin:0;background:#fff;border:1px solid #d9e8f6;padding:8px}',
  'ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
  'li{background:#fff;padding:4px}',
  'li[data-focused]{outline:2px solid #0c2340}',
  'button{border:1px solid #c5d2e0;background:#f4f8fc;color:#0c2340;border-radius:6px;padding:4px 8px;text-align:left}',
].join('')

const roots = new WeakMap<object, WatchNode>()

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function toRow(
  alarm: WatchAlarmInput,
  floors: ReadonlyMap<string, string>,
  focus: string | null,
): WatchRow | null {
  const floorId = clip(alarm.floorId, 16)
  const deviceId = clip(alarm.deviceId, 64)
  const message = clip(alarm.message, 48) || deviceId
  const id = clip(alarm.id, 64) || (floorId && deviceId ? `${floorId}-${deviceId}` : '')
  if (!floorId || !message || !id) return null
  const named = floors.get(floorId)
  const floorName = named ? clip(named, 24) || floorId : floorId
  return {
    id,
    floorId,
    floorName,
    deviceId,
    message,
    focused: focus != null && focus !== '' && deviceId !== '' && deviceId === focus,
  }
}

export function buildWatchModel(state: WatchState | null | undefined, limit = WATCH_ROW_LIMIT): WatchModel {
  const alarms = Array.isArray(state?.alarms) ? state.alarms : []
  const floors = new Map<string, string>()
  if (Array.isArray(state?.floors)) {
    for (const floor of state.floors) {
      const id = clip(floor?.id, 16)
      const name = clip(floor?.name, 24)
      if (id && name) floors.set(id, name)
    }
  }
  const focus = typeof state?.focusedDeviceId === 'string' ? state.focusedDeviceId : null
  const all: WatchRow[] = []
  for (const alarm of alarms) {
    if (!alarm || typeof alarm !== 'object') continue
    const row = toRow(alarm, floors, focus)
    if (row) all.push(row)
  }
  const rows = all.slice(0, Math.max(0, limit))
  return {
    card: all.find((row) => row.focused) ?? null,
    rows,
    extra: Math.max(0, all.length - rows.length),
    total: all.length,
  }
}

export function watchSignature(model: WatchModel): string {
  const card = model.card ? `${model.card.id}|${model.card.floorName}|${model.card.message}` : ''
  const rows = model.rows
    .map((row) => `${row.id}|${row.focused ? 1 : 0}|${row.floorName}|${row.message}`)
    .join(';')
  return `${model.total}|${model.extra}|${card}|${rows}`
}

function ensureRoot(doc: WatchDocument): WatchNode {
  const existing = roots.get(doc)
  if (existing) return existing
  const style = doc.createElement('style')
  style.textContent = PANEL_CSS
  doc.head.append(style)
  const root = doc.createElement('div')
  root.setAttribute('data-document-watch', '')
  doc.body.append(root)
  roots.set(doc, root)
  return root
}

/** 把列表画进小窗自己的文档。调用方保证这个文档不是主页面。 */
export function paintDocumentWatch(doc: WatchDocument, model: WatchModel, actions: WatchActions): void {
  doc.title = '文档值守'
  const root = ensureRoot(doc)
  const head = doc.createElement('div')
  head.setAttribute('class', 'dw-head')
  const title = doc.createElement('strong')
  title.textContent = '文档值守'
  const count = doc.createElement('span')
  count.setAttribute('data-count', '')
  count.textContent = String(model.total)
  const back = doc.createElement('button')
  back.setAttribute('type', 'button')
  back.setAttribute('data-back', '')
  back.textContent = '回到主页'
  back.addEventListener('click', () => actions.onBack())
  head.append(title, count, back)

  const card = doc.createElement('p')
  card.setAttribute('data-focus-card', '')
  card.textContent = model.card
    ? `当前焦点 ${model.card.floorName} ${model.card.message}`
    : '主视图没有焦点'

  const list = doc.createElement('ul')
  if (model.rows.length === 0) {
    const empty = doc.createElement('li')
    empty.textContent = '当前没有告警'
    list.append(empty)
  } else {
    for (const row of model.rows) {
      const item = doc.createElement('li')
      if (row.focused) item.setAttribute('data-focused', '')
      const jump = doc.createElement('button')
      jump.setAttribute('type', 'button')
      jump.setAttribute('data-alarm', row.id)
      jump.textContent = `${row.floorName} ${row.message}`
      jump.addEventListener('click', () => actions.onFocus(row))
      item.append(jump)
      list.append(item)
    }
  }

  const extra = doc.createElement('p')
  extra.setAttribute('data-extra', '')
  extra.textContent = model.extra > 0 ? `另${model.extra}条` : ''
  root.replaceChildren(head, card, list, extra)
}
