import { createElement, Fragment, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import { TOUR_CURVE, TOUR_SEGMENT_CAP, TOUR_TENSION_CAP } from './caps'
import { isAlarmTourLabel, TOUR_PATH_LAYER, tourPathGateOn, tourPathWanted } from './gate'

/**
 * T071：开发时 dock 在首帧之后 import 本文件。
 * 这里不静态引用播放实现。点击导览且门开着才动态 import。
 * 生产构建会把 dock 里的这段摘掉，改由哈希之后的引导在同一条件下 import 播放分包。
 */

let installed = false
let playing = false
let cancel: (() => void) | null = null
let token = 0

function markIdle(): void {
  token += 1
  playing = false
  cancel = null
}

function tourButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null
  const button = target.closest('button')
  if (!(button instanceof HTMLButtonElement)) return null
  if (!button.closest('[data-viewmark-root]')) return null
  if (!isAlarmTourLabel(button.textContent)) return null
  return button
}

function stopPlaying(): void {
  const current = cancel
  playing = false
  cancel = null
  token += 1
  current?.()
}

function onClick(event: MouseEvent): void {
  if (!tourPathGateOn()) return
  const button = tourButton(event.target)
  if (!button || button.disabled) return
  event.preventDefault()
  event.stopPropagation()
  if (playing) {
    stopPlaying()
    return
  }
  playing = true
  const mine = ++token
  void import('./session')
    .then((mod) => {
      if (mine !== token || !playing) return
      const session = mod.startMotionPathTour()
      if (mine !== token || !playing) {
        session.cancel()
        return
      }
      cancel = () => {
        playing = false
        cancel = null
        session.cancel()
      }
    })
    .catch(() => {
      if (mine === token) {
        playing = false
        cancel = null
      }
    })
}

function onKey(event: KeyboardEvent): void {
  if (!playing || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  stopPlaying()
}

/** 重复调用无事。观众地址上监听还在，但门关着时直接返回，不会 import 播放包。 */
export function mountMotionPath(): void {
  if (typeof document === 'undefined') return
  if (installed) return
  installed = true
  window.__twinMotionPathIdle = markIdle
  document.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKey, true)
}

/**
 * T069：导览轨开关。
 * 开发时 dock 在首帧 2600ms 之后动态 import 本文件。
 * 生产构建在 dock 哈希定稿后才把这条 import 接回去。
 * 曲线组件再等打开开关才加载，不进首屏门禁，也不进均衡后处理包。
 */

type Slot = ((node: ReactNode) => void) & {
  __tourBridge?: boolean
  __gridBridge?: boolean
  __decalBridge?: boolean
}
type LineComponent = () => ReactNode

let started = false
let on = false
let dismissed = false
let measureNode: ReactNode = null
let rawSlot: ((node: ReactNode) => void) | null = null
let LineComp: LineComponent | null = null
let loading: Promise<void> | null = null

function readOn(): boolean {
  return tourPathWanted(useTwinStore.getState().layers, undefined, dismissed)
}

function publish(): void {
  const prev = window.__twinTourPath
  const mounted = on && prev?.mounted === true
  window.__twinTourPath = {
    demo: true,
    on,
    mounted,
    points: mounted ? prev?.points ?? 0 : 0,
    segments: TOUR_SEGMENT_CAP,
    tension: TOUR_TENSION_CAP,
    curve: TOUR_CURVE,
  }
}

/**
 * 网格和贴花也包这条槽。若导览轨先包进去，后包的桥不会抄 __tourBridge，
 * 下一次再包到外面时，内外两层会共用上游并互相 flush，直到爆栈。
 * 所以等两个标记都在，再包到最外层，并让这一层自己记住当时的上游。
 */
function push(target: (node: ReactNode) => void, node: ReactNode): void {
  const line = on && LineComp ? createElement(LineComp) : null
  if (node != null && line != null) target(createElement(Fragment, null, node, line))
  else target(node ?? line ?? null)
}

function flush(): void {
  if (!rawSlot) return
  push(rawSlot, measureNode)
}

function wrapMeasureSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__tourBridge) return
  if (!current.__gridBridge || !current.__decalBridge) return
  const captured = current
  rawSlot = captured
  const wrapped: Slot = (node) => {
    measureNode = node
    push(captured, node)
  }
  wrapped.__tourBridge = true
  wrapped.__gridBridge = true
  wrapped.__decalBridge = true
  window.__twinMeasureSlot = wrapped
  if (on) push(captured, measureNode)
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：导览轨')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '导览轨'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-tour]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerTour = ''
    host.setAttribute('aria-label', '导览轨')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'tourPath'
    button.title = '讲解相机轨预览。默认关。不替换走廊人流。'
    button.addEventListener('click', () => {
      if (readOn()) {
        dismissed = true
        useTwinStore.getState().setLayer(TOUR_PATH_LAYER, false)
      } else {
        dismissed = false
        useTwinStore.getState().setLayer(TOUR_PATH_LAYER, true)
      }
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

async function loadLine(): Promise<void> {
  if (LineComp) return
  loading ??= import('./TourPathLine').then((mod) => {
    LineComp = mod.TourPathLine
  })
  await loading
}

async function sync(): Promise<void> {
  const next = readOn()
  on = next
  publish()
  ensureButton()
  if (!on) {
    flush()
    return
  }
  await loadLine()
  if (!readOn()) {
    on = false
    publish()
    flush()
    return
  }
  publish()
  flush()
}

/** dock 晚加载之后调用。默认关，不请求曲线分包。 */
export function mountTourPath(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  on = readOn()
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
    const next = readOn()
    if (next === on) return
    void sync()
  })
  if (on) void sync()
}

export function resetTourPathMountForTests(): void {
  started = false
  on = false
  dismissed = false
  measureNode = null
  rawSlot = null
  LineComp = null
  loading = null
}
