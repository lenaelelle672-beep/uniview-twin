import { createElement, type ReactNode } from 'react'
import { floorSpec, isFloorId } from '../data/floors'
import { useTwinStore } from '../store/store'
import {
  B1_ELEVATION_M,
  FLOOR_LIFT_M,
  OVERVIEW_Y,
  SEGMENT_LIMIT,
  floorPartitionLines,
  floorPlanUrl,
  overviewLines,
  presentSegments,
  readRoomRings,
  searchOfUrl,
  segmentToggleTitle,
  segmentsLayerOn,
  segmentsQueryOn,
  type BatchLine,
} from './plan'

/**
 * T072：批辅线开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求 drei Segments。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 节点交给格网那条槽，和测距、格网、作者辅助画在一起。不另包一层桥。
 */

type SegmentComponent = (props: { lines: readonly BatchLine[]; dropped: number }) => ReactNode

let started = false
let on = false
let lines: BatchLine[] = []
let dropped = 0
let shown = 0
let source: 'off' | 'overview' | 'floor' = 'off'
let floorId: string | null = null
let sceneKey = ''
let tokenGen = 0
let Comp: SegmentComponent | null = null
let loading: Promise<void> | null = null

const rings = new Map<string, Array<Array<[number, number]>>>()
const ringLoads = new Map<string, Promise<void>>()

const published = {
  on: false,
  mounted: false,
  shown: 0,
  limit: SEGMENT_LIMIT,
  dropped: 0,
  source: 'off' as 'off' | 'overview' | 'floor',
  floorId: null as string | null,
}

function publish(): void {
  published.on = on
  published.limit = SEGMENT_LIMIT
  published.shown = on ? shown : 0
  published.dropped = on ? dropped : 0
  published.source = on ? source : 'off'
  published.floorId = on ? floorId : null
  if (!on) published.mounted = false
  window.__twinSegments = published
}

function floorLift(id: string): number {
  const rows = window.__twinExplode?.floors
  if (!rows) return 0
  return rows.find((floor) => floor.id === id)?.offset ?? 0
}

function sceneSignature(): string {
  const state = useTwinStore.getState()
  const selected = state.view === 'floor' && state.selectedFloor ? state.selectedFloor : ''
  return [on ? 1 : 0, state.view, selected, floorLift(selected).toFixed(3), rings.has(selected) ? 1 : 0].join('|')
}

function loadRings(id: string): Promise<void> {
  const url = floorPlanUrl(id)
  if (!url) {
    rings.set(id, [])
    return Promise.resolve()
  }
  const pending = ringLoads.get(id)
  if (pending) return pending
  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        rings.set(id, [])
        return
      }
      const raw: unknown = await response.json()
      rings.set(id, readRoomRings(raw))
    })
    .catch(() => {
      rings.set(id, [])
    })
  ringLoads.set(id, request)
  return request
}

function currentLines(): { lines: BatchLine[]; source: 'overview' | 'floor'; floorId: string | null } {
  const state = useTwinStore.getState()
  if (state.view === 'floor' && state.selectedFloor && isFloorId(state.selectedFloor)) {
    const id = state.selectedFloor
    const elevation = floorSpec(id).elevation
    const y = elevation + floorLift(id) + FLOOR_LIFT_M
    const roomRings = rings.get(id)
    if (roomRings && roomRings.length > 0) {
      return { lines: floorPartitionLines(roomRings, y), source: 'floor', floorId: id }
    }
    if (id === 'B1') {
      return { lines: overviewLines(B1_ELEVATION_M + floorLift(id) + FLOOR_LIFT_M), source: 'floor', floorId: id }
    }
    return { lines: overviewLines(y), source: 'floor', floorId: id }
  }
  return { lines: overviewLines(OVERVIEW_Y), source: 'overview', floorId: null }
}

function paint(): void {
  const startedAt = performance.now()
  const tick = () => {
    if (window.__twinSceneOverlayFlush?.()) return
    if (performance.now() - startedAt > 8000) return
    window.setTimeout(tick, 50)
  }
  tick()
}

function setNode(node: ReactNode): void {
  window.__twinSegmentsNode = node
  paint()
}

async function loadSegments(): Promise<void> {
  if (Comp) return
  loading ??= import('./BatchSegments').then((mod) => {
    Comp = mod.BatchSegments
  })
  await loading
}

function paintButton(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  const title = segmentToggleTitle({ on, shown, dropped, limit: SEGMENT_LIMIT })
  if (
    button.getAttribute('aria-pressed') === String(on) &&
    button.lastElementChild?.textContent === label &&
    button.title === title
  ) {
    return
  }
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：批线')
  button.title = title
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '批线'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-segments]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerSegments = ''
    host.setAttribute('aria-label', '批线')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'segments'
    button.addEventListener('click', () => {
      const next = !segmentsLayerOn(useTwinStore.getState().layers)
      useTwinStore.getState().setLayer('segments', next)
    })
    list.append(button)
    host.append(list)
    const dock = row.querySelector('.viewmark-dock')
    if (dock) row.insertBefore(host, dock)
    else row.append(host)
  }
  const button = host.querySelector('button')
  if (button) paintButton(button)
}

async function refresh(): Promise<void> {
  const token = ++tokenGen
  publish()
  ensureButton()
  if (!on) {
    lines = []
    shown = 0
    dropped = 0
    source = 'off'
    floorId = null
    sceneKey = sceneSignature()
    publish()
    setNode(null)
    return
  }
  const state = useTwinStore.getState()
  const selected = state.view === 'floor' ? state.selectedFloor : null
  if (selected && isFloorId(selected) && floorPlanUrl(selected) && !rings.has(selected)) {
    await loadRings(selected)
  }
  if (token !== tokenGen || !on) return
  const built = currentLines()
  const fitted = presentSegments(built.lines, SEGMENT_LIMIT)
  lines = built.lines.slice(0, SEGMENT_LIMIT)
  shown = fitted.shown
  dropped = fitted.dropped
  source = built.source
  floorId = built.floorId
  sceneKey = sceneSignature()
  publish()
  await loadSegments()
  if (token !== tokenGen || !on || !Comp) return
  setNode(createElement(Comp, { lines, dropped }))
}

function bootSearch(): string {
  const live = typeof location === 'undefined' ? '' : location.search
  if (segmentsQueryOn(live) || typeof performance === 'undefined') return live
  const entry = performance.getEntriesByType('navigation')[0]
  return entry?.name ? searchOfUrl(entry.name) : live
}

/** dock 晚加载之后调用。默认关，不请求 Segments 分包。 */
export function mountBatchSegments(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const state = useTwinStore.getState()
  // 地址栏同步先丢掉 segments。播种只看启动 URL，之后以图层为准，关掉不会被写回。
  if (segmentsQueryOn(bootSearch()) && !segmentsLayerOn(state.layers)) {
    state.setLayer('segments', true)
  }
  on = segmentsLayerOn(useTwinStore.getState().layers)
  publish()
  ensureButton()
  const observer = new MutationObserver(() => {
    ensureButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(ensureButton, 200)
  useTwinStore.subscribe(() => {
    const nextOn = segmentsLayerOn(useTwinStore.getState().layers)
    if (nextOn === on && sceneSignature() === sceneKey) return
    on = nextOn
    ensureButton()
    void refresh()
  })
  if (on) void refresh()
}
