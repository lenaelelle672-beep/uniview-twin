import { demoEditActive } from '../demo-edit/flag'
import { RECT_AREA_CAP, acceptsRectAreaKey, cappedRectAreas } from './plan'

interface RectAreaHandle {
  ids: string[]
  detach: () => void
}

/**
 * T068：作者面光开关。
 * 和 T066 共用 `?demoEdit=1`（demoEditActive）。这里不实现 useHelper。
 * 默认关。只有打开后才 import 面光分包，那一层才会调用 RectAreaLightUniformsLib.init()。
 * 生产构建把本文件从 dock 哈希里摘掉，观众地址不请求它，因此不进 hardGate / balancedFx。
 */

type LiveModule = typeof import('./live')

interface Probe {
  author: boolean
  on: boolean
  init: boolean
  cap: number
  count: number
  ids: string[]
  helper: 'RectAreaLightHelper'
}

let started = false
let on = false
let author = false
let live: LiveModule | null = null
let loading: Promise<LiveModule> | null = null
let handle: RectAreaHandle | null = null
let waitFrame = 0

const published: Probe = {
  author: false,
  on: false,
  init: false,
  cap: RECT_AREA_CAP,
  count: 0,
  ids: [],
  helper: 'RectAreaLightHelper',
}

function publish(): void {
  published.author = author
  published.on = on
  published.cap = RECT_AREA_CAP
  published.ids = on && handle ? handle.ids.slice() : []
  published.count = published.ids.length
  window.__twinRectArea = {
    author: published.author,
    on: published.on,
    init: published.init,
    cap: published.cap,
    count: published.count,
    ids: published.ids.slice(),
    helper: 'RectAreaLightHelper',
  }
}

function redraw(): void {
  if (window.__vpP) {
    window.__vpP()
    return
  }
  void window.__twinInvalidate?.()
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label) return
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '作者面光')
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '面光'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  if (!author) return
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-rect-area]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.rectArea = ''
    host.setAttribute('aria-label', '作者面光')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.rectAreaToggle = ''
    button.title = '矩形面光和辅助框，快捷键 L。只在作者模式出现，默认关'
    button.addEventListener('click', () => {
      void setOn(!on)
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

function loadLive(): Promise<LiveModule> {
  if (live) return Promise.resolve(live)
  loading ??= import('./live').then((mod) => {
    live = mod
    return mod
  })
  return loading
}

function detach(): void {
  if (waitFrame) {
    cancelAnimationFrame(waitFrame)
    waitFrame = 0
  }
  handle?.detach()
  handle = null
  published.count = 0
  published.ids = []
}

function apply(mod: LiveModule, scene: NonNullable<Window['__twinScene']>): void {
  detach()
  handle = mod.attachRectAreaLights(scene, cappedRectAreas())
  published.init = true
  publish()
  redraw()
}

function waitScene(mod: LiveModule): void {
  if (waitFrame) return
  let tries = 0
  const tick = () => {
    waitFrame = 0
    if (!on) return
    const scene = window.__twinScene
    if (scene) {
      apply(mod, scene)
      return
    }
    if (tries++ > 180) return
    waitFrame = requestAnimationFrame(tick)
  }
  waitFrame = requestAnimationFrame(tick)
}

async function setOn(next: boolean): Promise<void> {
  if (!author || next === on) return
  on = next
  publish()
  ensureButton()
  if (!on) {
    detach()
    publish()
    redraw()
    return
  }
  const mod = await loadLive()
  if (!on) return
  const scene = window.__twinScene
  if (!scene) {
    waitScene(mod)
    return
  }
  apply(mod, scene)
}

function onKey(event: KeyboardEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (
    !acceptsRectAreaKey({
      key: event.key,
      repeat: event.repeat,
      altKey: event.altKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      isComposing: event.isComposing,
      target,
    })
  ) {
    return
  }
  event.preventDefault()
  void setOn(!on)
}

/** dock 晚加载之后调用。不是作者模式就直接返回，不拉面光分包。 */
export function mountRectAreaLights(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  author = demoEditActive()
  on = false
  published.init = false
  publish()
  if (!author) return
  ensureButton()
  window.addEventListener('keydown', onKey)
  const observer = new MutationObserver(() => {
    ensureButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
