import { createElement, Fragment, type ReactNode } from 'react'
import { floorSpec, isFloorId } from '../data/floors'
import { demoCameraAnchors } from '../cameras-demo/DEMO_cameras'
import { floorJsonFile } from '../floors/deskCounts'
import { useTwinStore } from '../store/store'
import {
  B1_CORE_WALLS,
  STICKER_CAP,
  buildStickers,
  decalsLayerOn,
  orderAnchors,
  readDesks,
  readWalls,
  type AnchorPoint,
  type StickerView,
  type WallSeg,
} from './stickers'

/**
 * T065：贴花开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求 drei Decal。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 */

type Slot = ((node: ReactNode) => void) & { __decalBridge?: boolean; __gridBridge?: boolean }
type DecalComponent = (props: { stickers: readonly StickerView[] }) => ReactNode

let started = false
let on = false
let stickers: readonly StickerView[] = []
let stickerNode: ReactNode = null
let measureNode: ReactNode = null
let rawSlot: ((node: ReactNode) => void) | null = null
let bridge: Slot | null = null
let DecalComp: DecalComponent | null = null
let loading: Promise<void> | null = null
let sceneKey = ''
let planToken = 0

const walls = new Map<string, WallSeg[]>()
const desks = new Map<string, Array<{ id: string; x: number; z: number }>>()
const planLoads = new Map<string, Promise<void>>()

const published = {
  on: false,
  mounted: 0,
  decals: 0,
  images: 0,
  cap: STICKER_CAP,
  blocked: false,
}

function publish(): void {
  published.on = on
  published.cap = STICKER_CAP
  if (!on) {
    published.mounted = 0
    published.decals = 0
    published.images = 0
    published.blocked = false
  }
  window.__twinDecals = published
}

function floorLift(floorId: string): number {
  const rows = window.__twinExplode?.floors
  if (!rows) return 0
  return rows.find((floor) => floor.id === floorId)?.offset ?? 0
}

function alertAnchor(floorId: string): AnchorPoint | null {
  const state = useTwinStore.getState()
  const device = state.focusedDeviceId
    ? state.devices.find((item) => item.id === state.focusedDeviceId) ?? null
    : null
  const deskId = device?.deskId || state.focusedDeskId
  if (!deskId) return null
  const splitAt = deskId.lastIndexOf('-')
  const deskFloor = splitAt > 0 ? deskId.slice(0, splitAt) : ''
  if (deskFloor !== floorId) return null
  const alarmDevice =
    (device != null && device.status === 'alarm' && device.floorId === floorId) ||
    state.devices.some((item) => item.deskId === deskId && item.floorId === floorId && item.status === 'alarm') ||
    (device != null && state.alarms.some((item) => item.deviceId === device.id))
  if (!alarmDevice) return null
  const live = window.__twinFloor
  const fromLive = live?.floorId === floorId ? live.desks.find((item) => item.id === deskId) : undefined
  const fromPlan = desks.get(floorId)?.find((item) => item.id === deskId)
  const point = fromLive ?? fromPlan
  if (!point) return null
  return { id: `alert-${deskId}`, role: 'alert', x: point.x, z: point.z }
}

function demoAnchors(floorId: string): AnchorPoint[] {
  return demoCameraAnchors(floorId).map((anchor) => ({
    id: anchor.id,
    role: 'demo' as const,
    x: anchor.x,
    z: anchor.z,
  }))
}

function currentStickers(): StickerView[] {
  const state = useTwinStore.getState()
  if (!on || state.view !== 'floor' || !state.selectedFloor || !isFloorId(state.selectedFloor)) return []
  const floorId = state.selectedFloor
  const segments = walls.get(floorId)
  if (!segments) return []
  return buildStickers({
    anchors: orderAnchors(alertAnchor(floorId), demoAnchors(floorId)),
    walls: segments,
    elevation: floorSpec(floorId).elevation,
    lift: floorLift(floorId),
  })
}

function sceneSignature(): string {
  const state = useTwinStore.getState()
  const floorId = state.selectedFloor ?? ''
  return [
    on ? 1 : 0,
    state.view,
    floorId,
    state.focusedDeskId ?? '',
    state.focusedDeviceId ?? '',
    floorLift(floorId),
    walls.has(floorId) ? 1 : 0,
  ].join('|')
}

function loadPlan(floorId: string): Promise<void> {
  if (floorId === 'B1') {
    walls.set('B1', B1_CORE_WALLS.slice())
    return Promise.resolve()
  }
  const pending = planLoads.get(floorId)
  if (pending) return pending
  const request = fetch(`/floors/${floorJsonFile(floorId)}`)
    .then(async (response) => {
      if (!response.ok) return
      const raw: unknown = await response.json()
      walls.set(floorId, readWalls(raw))
      desks.set(floorId, readDesks(raw))
    })
    .catch(() => {
      walls.set(floorId, [])
    })
  planLoads.set(floorId, request)
  return request
}

function flush(): void {
  if (!rawSlot) return
  stickerNode = on && DecalComp && stickers.length > 0 ? createElement(DecalComp, { stickers }) : null
  if (measureNode && stickerNode) rawSlot(createElement(Fragment, null, measureNode, stickerNode))
  else rawSlot(measureNode ?? stickerNode ?? null)
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：贴花')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '贴花'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-decals]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerDecals = ''
    host.setAttribute('aria-label', '贴花')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'decals'
    button.title = '告警焦点和 DEMO 墙面贴花。默认关。'
    button.addEventListener('click', () => {
      const next = !decalsLayerOn(useTwinStore.getState().layers)
      useTwinStore.getState().setLayer('decals', next)
    })
    list.append(button)
    host.append(list)
    const dock = row.querySelector('.viewmark-dock')
    if (dock) row.insertBefore(host, dock)
    else row.append(host)
  }
  const button = host.querySelector('button')
  if (button) paint(button)
}

function wrapMeasureSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__decalBridge) return
  // 网格桥和贴花桥共用同一个测距槽。两边如果反复把对方收成上游，
  // flush 会互相调用直到爆栈。只包一次，并且包在网格外面时留下它的标记，
  // 这样网格不会再把贴花收进去。
  if (bridge) {
    if (current.__gridBridge) return
    bridge = null
  }
  const upstream = current
  rawSlot = upstream
  const wrapped: Slot = (node) => {
    measureNode = node
    flush()
  }
  wrapped.__decalBridge = true
  if (upstream.__gridBridge) wrapped.__gridBridge = true
  bridge = wrapped
  window.__twinMeasureSlot = wrapped
  if (on) flush()
}

async function loadDecals(): Promise<void> {
  if (DecalComp) return
  loading ??= import('./WallDecals').then((mod) => {
    DecalComp = mod.WallDecals
  })
  await loading
}

async function refresh(): Promise<void> {
  const token = ++planToken
  publish()
  if (!on) {
    stickers = []
    flush()
    return
  }
  const state = useTwinStore.getState()
  const floorId = state.view === 'floor' ? state.selectedFloor : null
  if (floorId && isFloorId(floorId) && !walls.has(floorId)) await loadPlan(floorId)
  if (token !== planToken) return
  stickers = currentStickers()
  sceneKey = sceneSignature()
  if (stickers.length === 0) {
    flush()
    return
  }
  await loadDecals()
  if (!on || token !== planToken) return
  stickers = currentStickers()
  sceneKey = sceneSignature()
  flush()
}

/** dock 晚加载之后调用。默认关，不请求 Decal 分包。 */
export function mountWallDecals(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  on = decalsLayerOn(useTwinStore.getState().layers)
  publish()
  ensureButton()
  wrapMeasureSlot()
  const observer = new MutationObserver(() => {
    ensureButton()
    wrapMeasureSlot()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(() => {
    ensureButton()
    wrapMeasureSlot()
  }, 200)
  useTwinStore.subscribe(() => {
    const nextOn = decalsLayerOn(useTwinStore.getState().layers)
    if (nextOn === on && nextOn === false) return
    on = nextOn
    ensureButton()
    const nextKey = sceneSignature()
    if (nextKey === sceneKey && on) return
    void refresh()
  })
  if (on) void refresh()
}
