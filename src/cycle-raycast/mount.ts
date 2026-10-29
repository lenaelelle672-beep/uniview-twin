import { createElement, Fragment, type ReactNode } from 'react'
import { authorModeOn } from '../author/gate'
import { navigationSearch } from '../demo-edit/flag'
import { useTwinStore } from '../store/store'
import { cycleScopeEnabled } from './policy'
import { bindCycleToggle, setCycleFlags } from './session'

/**
 * T086：密叠拾取轮询的开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求 drei CycleRaycast。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 */

type Slot = ((node: ReactNode) => void) & { __cycleBridge?: boolean }
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
  const state = useTwinStore.getState()
  const scope = {
    demo: authorModeOn({ search, navigation: navigationSearch(), layers: state.layers }),
    dense: state.presentation === 'model',
  }
  return cycleScopeEnabled(override, search, navigationSearch(), scope)
}

function publish(next: boolean): void {
  on = next
  setCycleFlags(next ? { on: true } : { on: false, mounted: false, hold: false })
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
  if (!current || current.__cycleBridge) return
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
  wrapped.__cycleBridge = true
  window.__twinMeasureSlot = wrapped
  if (on) push(captured, measureNode)
}

async function loadLive(): Promise<void> {
  if (Comp) return
  loading ??= import('./CycleLayer').then((mod) => {
    Comp = mod.CycleLayer
  })
  await loading
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  const title = on
    ? '画布上按 Tab 轮询密叠命中，侧栏跟着当前工位。Shift 仍是框选，滚轮仍是镜头。'
    : '默认关。DEMO 或模型层才轮询密叠拾取，不进观众首屏。'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label && button.title === title) {
    return
  }
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：轮询')
  button.title = title
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '轮询'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-cycle-raycast]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerCycleRaycast = ''
    host.setAttribute('aria-label', '轮询')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'cycleRaycast'
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

function beginCycleMount(): void {
  if (started || typeof document === 'undefined') return
  started = true
  bindCycleToggle((next) => {
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
    if (override != null) return
    const next = readOn()
    if (next === on) return
    void sync()
  }, 200)
  useTwinStore.subscribe(() => {
    if (override != null) return
    const next = readOn()
    if (next === on) return
    void sync()
  })
  if (on) void sync()
}

/** dock 晚加载之后调用。再让出一帧，避开 floorDecor 落定那一拍。默认关，不请求 drei CycleRaycast。 */
export function mountCycleRaycast(): void {
  if (typeof document === 'undefined' || started) return
  window.requestAnimationFrame(() => {
    beginCycleMount()
  })
}
