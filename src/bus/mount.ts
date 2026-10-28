/**
 * T081：同源多标签薄总线。
 * dock 在首帧约 2600ms 之后才 import 本文件，不进首屏体积。
 * 固定频道 uniview-twin。只接力 focus、视角令牌、alarmId、图层。
 * 这不是 T049 的分享链接：不写剪贴板，不拼 `?vp=` 深链。
 * `?bus=0` 或按钮关掉时 close()。
 */

import { useTwinStore } from '../store/store'
import {
  alarmIdFor,
  initialBusWanted,
  createTabId,
  isBusFloor,
  projectBusState,
  type BusBody,
  type BusCam,
  type BusLayerKey,
  type BusView,
} from './policy'
import { startBus, type BusChannel, type RunningBus } from './runtime'

const BUTTON_STYLE = '.topbar .twin-bus-toggle[aria-pressed="false"]{opacity:.55}'

let running: RunningBus | null = null
let started = false
let observer: MutationObserver | null = null

function readSnapshot() {
  const state = useTwinStore.getState()
  return projectBusState({
    focusSeq: state.focusSeq,
    vpSeq: state.vpSeq,
    floor: state.selectedFloor,
    deskId: state.focusedDeskId,
    deviceId: state.focusedDeviceId,
    vp: state.vp,
    view: state.view,
    cam: state.cam,
    alarmId: alarmIdFor(state.focusedDeviceId, state.alarms),
    layers: state.layers,
  })
}

function applyBody(body: BusBody): void {
  const api = useTwinStore.getState()
  if (body.t === 'layer') {
    const setLayer = api.setLayer as (key: BusLayerKey, on: boolean) => void
    setLayer(body.key, body.on)
    return
  }
  if (body.t === 'vp') {
    api.showViewpoint({
      token: body.token,
      view: body.view as BusView,
      floor: body.floor,
      cam: body.cam as BusCam | null,
      pos: body.pos,
    })
    return
  }
  if (body.t === 'alarmId') {
    const state = useTwinStore.getState()
    const alarm = state.alarms.find((item) => item.id === body.alarmId)
    const deviceId = alarm?.deviceId ?? body.deviceId
    const device = deviceId ? state.devices.find((item) => item.id === deviceId) : undefined
    const floor = alarm?.floorId && isBusFloor(alarm.floorId) ? alarm.floorId : body.floor
    api.focusDevice({
      floor,
      deskId: device?.deskId ?? body.deskId,
      deviceId,
    })
    return
  }
  api.focusDevice({
    floor: body.floor,
    deskId: body.deskId,
    deviceId: body.deviceId,
  })
}

function publishProbe(): void {
  if (typeof window === 'undefined') return
  if (!running) {
    window.__twinBus = undefined
    return
  }
  const bus = running
  window.__twinBus = {
    get on() {
      return bus.probe().on
    },
    get channel() {
      return bus.probe().channel
    },
    get tab() {
      return bus.probe().tab
    },
    get sent() {
      return bus.probe().sent
    },
    get applied() {
      return bus.probe().applied
    },
    get dropped() {
      return bus.probe().dropped
    },
    get closed() {
      return bus.probe().closed
    },
    setOn: setBroadcastBus,
  }
}

function browserChannel(name: string): BusChannel {
  const channel = new BroadcastChannel(name)
  let handler: BusChannel['onmessage'] = null
  return {
    postMessage(data) {
      channel.postMessage(data)
    },
    get onmessage() {
      return handler
    },
    set onmessage(next) {
      handler = next
      channel.onmessage = next ? (event) => next({ data: event.data }) : null
    },
    close() {
      channel.onmessage = null
      channel.close()
    },
  }
}

function ensureStyle(): void {
  if (typeof document === 'undefined' || document.querySelector('style[data-twin-bus]')) return
  const style = document.createElement('style')
  style.dataset.twinBus = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function renderButton(): void {
  if (typeof document === 'undefined') return
  const button = document.querySelector<HTMLButtonElement>('button.twin-bus-toggle') ?? createButton()
  if (!button) return
  const on = running?.enabled() ?? false
  const label = on ? '多屏开' : '多屏关'
  const pressed = on ? 'true' : 'false'
  if (button.textContent !== label) button.textContent = label
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  button.dataset.bus = on ? 'on' : 'off'
}

function createButton(): HTMLButtonElement | null {
  const bar = document.querySelector('.topbar')
  if (!bar) return null
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'text-button twin-bus-toggle'
  button.setAttribute('aria-label', '多屏同步')
  button.addEventListener('click', () => {
    setBroadcastBus(!(running?.enabled() ?? false))
  })
  const search = bar.querySelector('.search-wrap')
  if (search) bar.insertBefore(button, search)
  else bar.append(button)
  return button
}

function watchTopbar(): void {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function' || observer) return
  observer = new MutationObserver(() => {
    if (!document.querySelector('button.twin-bus-toggle')) renderButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function onPageHide(): void {
  running?.close()
  renderButton()
  publishProbe()
}

export function setBroadcastBus(on: boolean): void {
  running?.setEnabled(on)
  renderButton()
  publishProbe()
}

export function closeBroadcastBus(): void {
  running?.close()
  observer?.disconnect()
  observer = null
  if (typeof document !== 'undefined') document.querySelector('button.twin-bus-toggle')?.remove()
  publishProbe()
}

export function resetBroadcastBusForTests(): void {
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide)
  closeBroadcastBus()
  running = null
  started = false
}

/** loadViewpoint 只在收到视角令牌时调用，用来拉已有的落点模块，不是分享链接。 */
export function mountBroadcastBus(loadViewpoint?: () => Promise<unknown>): void {
  if (started || typeof window === 'undefined') return
  started = true
  const search = window.location?.search ?? ''
  const wanted = initialBusWanted(search) && typeof BroadcastChannel !== 'undefined'
  running = startBus({
    tabId: createTabId(),
    enabled: wanted,
    openChannel: browserChannel,
    read: readSnapshot,
    apply: applyBody,
    subscribe: (listener) => useTwinStore.subscribe(listener),
    loadViewpoint,
  })
  ensureStyle()
  renderButton()
  watchTopbar()
  window.addEventListener('pagehide', onPageHide)
  publishProbe()
}
