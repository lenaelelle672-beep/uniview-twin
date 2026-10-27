import { createElement, type ReactNode } from 'react'
import { useTwinStore } from '../store/store'
import {
  SCREEN_VIDEO_SRC,
  screenVideoLayerOn,
  screenVideoQueryOn,
  searchOfUrl,
} from './plan'

/**
 * T074：工位屏开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求画面分包。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 节点交给格网那条槽。画面组件再等打开开关才加载。
 */

type ScreenComponent = () => ReactNode

let started = false
let on = false
let Comp: ScreenComponent | null = null
let loading: Promise<void> | null = null

function publish(): void {
  const prev = window.__twinScreenVideo
  window.__twinScreenVideo = {
    demo: true,
    on,
    mounted: on ? prev?.mounted === true : false,
    src: SCREEN_VIDEO_SRC,
    muted: true,
    playsInline: true,
    loop: true,
    desks: on ? prev?.desks ?? 0 : 0,
    camera: on ? prev?.camera === true : false,
    hls: false,
    impl: 'drei-useVideoTexture',
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
  window.__twinScreenVideoNode = node
  paint()
}

async function loadScreen(): Promise<void> {
  if (Comp) return
  loading ??= import('./DeskScreenVideo').then((mod) => {
    Comp = mod.DeskScreenVideo
  })
  await loading
}

function paintButton(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：工位屏')
  button.title = '工位显示器和摄像头预览。本地短片，默认关。'
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '工位屏'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-screen-video]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerScreenVideo = ''
    host.setAttribute('aria-label', '工位屏')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'screenVideo'
    button.addEventListener('click', () => {
      const next = !screenVideoLayerOn(useTwinStore.getState().layers)
      useTwinStore.getState().setLayer('screenVideo', next)
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
  if (screenVideoQueryOn(live) || typeof performance === 'undefined') return live
  const entry = performance.getEntriesByType('navigation')[0]
  return entry?.name ? searchOfUrl(entry.name) : live
}

/** dock 晚加载之后调用。默认关，不请求画面分包。 */
export function mountScreenVideo(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const state = useTwinStore.getState()
  if (screenVideoQueryOn(bootSearch()) && !screenVideoLayerOn(state.layers)) {
    state.setLayer('screenVideo', true)
  }
  on = screenVideoLayerOn(useTwinStore.getState().layers)
  publish()
  ensureButton()
  const observer = new MutationObserver(() => {
    ensureButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setInterval(ensureButton, 200)
  useTwinStore.subscribe(() => {
    const next = screenVideoLayerOn(useTwinStore.getState().layers)
    if (next === on) return
    on = next
    ensureButton()
    void refresh()
  })
  if (on) void refresh()
}
