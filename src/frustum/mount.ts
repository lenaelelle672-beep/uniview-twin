import { createElement, Fragment, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import { emitBlink, type FrustumBlinkState } from './blinkGate'
import {
  frustumPauseWanted,
  frustumSentinelScale,
  pickFrustumSearch,
  type FrustumReason,
} from './plan'

/**
 * T076：视锥暂停的开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求视锥检测分包。
 * 性能档默认开。`?frustum=1` / `?frustum=0` 盖过画质。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去，因此不进 hardGate / balancedFx。
 * 节点交给测距那条槽，不另开一条 Canvas。
 */

type Slot = ((node: ReactNode) => void) & {
  __frustumBridge?: boolean
  __gridBridge?: boolean
  __decalBridge?: boolean
  __focusBridge?: boolean
}

type LiveProps = { scale: number; reason: FrustumReason }
type LiveComponent = (props: LiveProps) => ReactNode

let started = false
let override: boolean | null = null
let on = false
let reason: FrustumReason = 'off'
let scale = 1
let measureNode: ReactNode = null
let rawSlot: ((node: ReactNode) => void) | null = null
let Live: LiveComponent | null = null
let loading: Promise<void> | null = null
let sceneKey = ''
let wrapToken = 0

function bootSearch(): string {
  const live = typeof location === 'undefined' ? '' : location.search
  if (typeof performance === 'undefined') return live
  const entry = performance.getEntriesByType('navigation')[0]
  return pickFrustumSearch(live, entry?.name ?? '')
}

function wanted(): { on: boolean; reason: FrustumReason; scale: number } {
  const quality = useTwinStore.getState().quality
  const base = override == null ? frustumPauseWanted(quality, bootSearch()) : { on: override, reason: override ? 'query' as const : 'query-off' as const }
  return { ...base, scale: frustumSentinelScale(quality) }
}

function idleState(): FrustumBlinkState {
  const next = wanted()
  return {
    on: next.on,
    reason: next.reason,
    scale: next.scale,
    primed: false,
    alarm: null,
    flash: null,
    sign: null,
    lamps: 0,
    lampsHidden: 0,
  }
}

function publishIdle(): void {
  if (on && Live) return
  emitBlink(idleState())
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

function carryFlags(from: object, to: Slot): void {
  for (const key of Object.keys(from)) {
    if (!key.startsWith('__')) continue
    ;(to as unknown as Record<string, unknown>)[key] = (from as Record<string, unknown>)[key]
  }
}

function push(target: (node: ReactNode) => void, node: ReactNode): void {
  const ours = on && Live ? createElement(Live, { scale, reason }) : null
  if (node != null && ours != null) target(createElement(Fragment, null, node, ours))
  else target(node ?? ours ?? null)
}

function flush(): void {
  if (!rawSlot) return
  push(rawSlot, measureNode)
  if (on && Live) paint()
}

function wrapSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__frustumBridge) return
  // 网格、贴花、对焦也会包这条槽，而且不会抄走视锥标记。
  // 若后包的桥把旧包装成上游，共享的 rawSlot 再指回去就会互相 flush 直到爆栈。
  // 每一层记住自己包进去时的上游；被新的一层盖住后只把节点交出去，不再塞第二个宿主。
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
    if (on && Live) paint()
  }
  carryFlags(captured, wrapped)
  wrapped.__frustumBridge = true
  window.__twinMeasureSlot = wrapped
  if (on) push(captured, measureNode)
}

async function loadLive(): Promise<void> {
  if (Live) return
  loading ??= import('./BlinkFrustum').then((mod) => {
    Live = mod.BlinkFrustum
  })
  await loading
}

function paintButton(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  const title = on
    ? '视锥外暂停远处路灯和告警闪烁。当前开。'
    : '视锥外暂停远处路灯和告警闪烁。默认关，性能档默认开。'
  if (
    button.getAttribute('aria-pressed') === String(on) &&
    button.lastElementChild?.textContent === label &&
    button.title === title
  ) {
    return
  }
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：视锥')
  button.title = title
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '视锥'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-frustum]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerFrustum = ''
    host.setAttribute('aria-label', '视锥')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'frustum'
    button.addEventListener('click', () => {
      override = !wanted().on
      void refresh()
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
  const next = wanted()
  on = next.on
  reason = next.reason
  scale = next.scale
  sceneKey = `${on ? 1 : 0}|${reason}|${scale}`
  ensureButton()
  publishIdle()
  if (!on) {
    flush()
    return
  }
  await loadLive()
  if (!on || !Live) return
  flush()
}

/** dock 晚加载之后调用。默认关，不请求视锥检测分包。 */
export function mountFrustumPause(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const query = bootSearch()
  const seeded = frustumPauseWanted(useTwinStore.getState().quality, query)
  if (seeded.reason === 'query' || seeded.reason === 'query-off') override = seeded.on
  publishIdle()
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
    const next = wanted()
    const key = `${next.on ? 1 : 0}|${next.reason}|${next.scale}`
    if (key === sceneKey) return
    void refresh()
  })
  void refresh()
}
