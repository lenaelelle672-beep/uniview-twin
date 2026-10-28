import { createElement, Fragment, type ReactNode } from 'react'
import { navigationSearch } from '../demo-edit/flag'
import { useTwinStore } from '../store/store'
import { dragEnabled } from './plan'
import { bindDragToggle, setDragFlags } from './session'

/**
 * T080：作者态拖摆的开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求 drei DragControls。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 */

type Slot = ((node: ReactNode) => void) & { __dragBridge?: boolean }
type LiveComponent = () => ReactNode

let started = false
let override: boolean | null = null
let on = false
let measureNode: ReactNode = null
let rawSlot: ((node: ReactNode) => void) | null = null
let Comp: LiveComponent | null = null
let loading: Promise<void> | null = null
let syncToken = 0
let wrapToken = 0

function readOn(): boolean {
  const search = typeof location === 'undefined' ? '' : location.search
  return dragEnabled(override, search, navigationSearch(), useTwinStore.getState().layers)
}

function publish(next: boolean): void {
  on = next
  setDragFlags(next ? { on: true } : { on: false, mounted: false, dragging: false, latched: false })
}

function carryFlags(from: object, to: Slot): void {
  for (const key of Object.keys(from)) {
    if (!key.startsWith('__')) continue
    ;(to as unknown as Record<string, unknown>)[key] = (from as Record<string, unknown>)[key]
  }
}

function push(target: (node: ReactNode) => void, node: ReactNode): void {
  const ours = on && Comp ? createElement(Comp) : null
  if (node != null && ours != null) target(createElement(Fragment, null, node, ours))
  else target(node ?? ours ?? null)
}

function flush(): void {
  if (!rawSlot) return
  push(rawSlot, measureNode)
  void window.__twinInvalidate?.()
}

function wrapSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__dragBridge) return
  const token = ++wrapToken
  const captured = current
  rawSlot = captured
  const wrapped: Slot = (node) => {
    measureNode = node
    if (token !== wrapToken) {
      captured(node)
      return
    }
    push(captured, node)
  }
  carryFlags(captured, wrapped)
  wrapped.__dragBridge = true
  window.__twinMeasureSlot = wrapped
  if (on) push(captured, measureNode)
}

async function loadLive(): Promise<void> {
  if (Comp) return
  loading ??= import('./PlacementDrag').then((mod) => {
    Comp = mod.PlacementDrag
  })
  await loading
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  const title = on
    ? '作者态拖设备、家具落点。拖的时候镜头轨道锁住。Shift 仍是框选。'
    : '默认关。?demoEdit=1 或作者态才拖落点，不进观众路径。'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label && button.title === title) {
    return
  }
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：拖摆')
  button.title = title
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '拖摆'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-placement-drag]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerPlacementDrag = ''
    host.setAttribute('aria-label', '拖摆')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'placementDrag'
    button.addEventListener('click', () => {
      override = !readOn()
      void sync()
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

async function sync(): Promise<void> {
  const token = ++syncToken
  const next = readOn()
  publish(next)
  ensureButton()
  if (!next) {
    flush()
    return
  }
  await loadLive()
  if (token !== syncToken) return
  if (!readOn()) {
    publish(false)
    flush()
    return
  }
  flush()
}

/** dock 晚加载之后调用。默认关，不请求 drei DragControls。 */
export function mountPlacementDrag(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  bindDragToggle((next) => {
    override = next
    void sync()
  })
  publish(readOn())
  ensureButton()
  wrapSlot()
  const observer = new MutationObserver(() => {
    ensureButton()
    wrapSlot()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(() => {
    ensureButton()
    wrapSlot()
  }, 200)
  useTwinStore.subscribe(() => {
    if (override != null) return
    const next = readOn()
    if (next === on) return
    void sync()
  })
  if (on) void sync()
}
