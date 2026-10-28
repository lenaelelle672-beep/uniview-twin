import { createElement, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  CAMERA_POSTER_SRC,
  DESK_POSTER_SRC,
  SCREEN_POSTER_CAP,
  screenImageInitialOn,
  screenImageLayerOn,
  screenImageQuery,
  searchOfUrl,
} from './plan'

/**
 * T079：屏海报开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认开，用来补 T074 视频默认关时的屏幕。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 画面组件再等开关打开才加载，不进 hardGate / balancedFx。
 */

type ScreenComponent = () => ReactNode

let started = false
let on = false
let Comp: ScreenComponent | null = null
let loading: Promise<void> | null = null

function publish(): void {
  const prev = window.__twinScreenImage
  window.__twinScreenImage = {
    demo: true,
    on,
    mounted: on ? prev?.mounted === true : false,
    desks: on ? prev?.desks ?? 0 : 0,
    camera: on ? prev?.camera === true : false,
    cap: SCREEN_POSTER_CAP,
    deskSrc: DESK_POSTER_SRC,
    cameraSrc: CAMERA_POSTER_SRC,
    impl: 'drei-Image',
    rounded: false,
  }
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
  window.__twinScreenImageNode = node
  paint()
}

async function loadScreen(): Promise<void> {
  if (Comp) return
  loading ??= import('./DeskScreenPosters').then((mod) => {
    Comp = mod.DeskScreenPosters
  })
  await loading
}

function paintButton(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：屏海报')
  button.title = '工位显示器和摄像头预览的静态海报。本地图片，默认开。'
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '屏海报'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-screen-image]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerScreenImage = ''
    host.setAttribute('aria-label', '屏海报')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'screenImage'
    button.addEventListener('click', () => {
      const next = !on
      useTwinStore.getState().setLayer('screenImage', next)
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
  publish()
  ensureButton()
  if (!on) {
    setNode(null)
    publish()
    return
  }
  await loadScreen()
  if (!on || !Comp) return
  setNode(createElement(Comp))
  publish()
}

function bootSearch(): string {
  const live = typeof location === 'undefined' ? '' : location.search
  if (screenImageQuery(live) !== 'auto' || typeof performance === 'undefined') return live
  const entry = performance.getEntriesByType('navigation')[0]
  return entry?.name ? searchOfUrl(entry.name) : live
}

/** dock 晚加载之后调用。默认开，显式 screenImage=0 才关。 */
export function mountScreenImage(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const query = screenImageQuery(bootSearch())
  const state = useTwinStore.getState()
  if (query === 'off') state.setLayer('screenImage', false)
  else if (query === 'on') state.setLayer('screenImage', true)
  on = screenImageInitialOn(bootSearch(), useTwinStore.getState().layers)
  publish()
  ensureButton()
  const observer = new MutationObserver(() => {
    ensureButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(ensureButton, 200)
  useTwinStore.subscribe(() => {
    const next = screenImageLayerOn(useTwinStore.getState().layers)
    if (next === on) return
    on = next
    ensureButton()
    void refresh()
  })
  if (on) void refresh()
}
