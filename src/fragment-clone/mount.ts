import { createElement, Fragment, type ReactNode } from 'react'
import { navigationSearch } from '../demo-edit/flag'
import {
  CLONE_CAP,
  CLONE_CAST_SHADOW,
  CLONE_DEEP,
  CLONE_RECEIVE_SHADOW,
  cloneEnabled,
  cloneSlotReady,
  type CloneSlotFlags,
} from './plan'

/**
 * T077：路灯片段浅拷的开关。
 * dock 在首帧 2600ms 之后才 import 本文件。默认关，不请求 drei Clone。
 * 生产构建会在 dock 哈希定稿后才把这条 import 接回去。
 * 节点包在测距槽最外层。不改格网、贴花、导览轨的文件。
 */

type Slot = ((node: ReactNode) => void) & CloneSlotFlags
type CloneComponent = () => ReactNode

let started = false
let override: boolean | null = null
let on = false
let measureNode: ReactNode = null
let capturedSlot: ((node: ReactNode) => void) | null = null
let Comp: CloneComponent | null = null
let loading: Promise<void> | null = null
let syncToken = 0

function readOn(): boolean {
  const search = typeof location === 'undefined' ? '' : location.search
  return cloneEnabled(override, search, navigationSearch())
}

function publish(): void {
  const prev = window.__twinClone
  const probe = (window.__twinClone ??= {
    on: false,
    mounted: false,
    count: 0,
    cap: CLONE_CAP,
    dropped: 0,
    deep: CLONE_DEEP,
    castShadow: CLONE_CAST_SHADOW,
    receiveShadow: CLONE_RECEIVE_SHADOW,
    sharedMaterials: true,
    source: 'off',
  })
  probe.on = on
  probe.cap = CLONE_CAP
  probe.deep = CLONE_DEEP
  probe.castShadow = CLONE_CAST_SHADOW
  probe.receiveShadow = CLONE_RECEIVE_SHADOW
  probe.sharedMaterials = true
  probe.source = on ? 'street_lamp' : 'off'
  probe.setOn = (next: boolean) => {
    override = next
    void sync()
  }
  if (!on || !prev?.on) {
    probe.mounted = false
    probe.count = 0
    probe.dropped = 0
  }
}

function push(target: (node: ReactNode) => void, node: ReactNode): void {
  const clones = on && Comp ? createElement(Comp) : null
  if (node != null && clones != null) target(createElement(Fragment, null, node, clones))
  else target(node ?? clones ?? null)
}

function flush(): void {
  if (!capturedSlot) return
  push(capturedSlot, measureNode)
  void window.__twinInvalidate?.()
}

function copyFlags(from: object, to: Slot): void {
  const record = from as Record<string, unknown>
  const target = to as unknown as Record<string, boolean>
  for (const key of Object.keys(record)) {
    if (key.startsWith('__') && typeof record[key] === 'boolean') target[key] = record[key] as boolean
  }
  to.__gridBridge = true
  to.__decalBridge = true
  to.__tourBridge = true
  to.__cloneBridge = true
}

function wrapMeasureSlot(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!cloneSlotReady(current)) return
  const captured = current as Slot
  capturedSlot = captured
  const wrapped: Slot = (node) => {
    measureNode = node
    push(captured, node)
  }
  copyFlags(captured, wrapped)
  window.__twinMeasureSlot = wrapped
  if (on) push(captured, measureNode)
}

function paint(button: HTMLButtonElement): void {
  const label = on ? '开' : '关'
  const title = on
    ? `路灯片段浅拷 ${CLONE_CAP} 盏。材质与实例路灯共用，改一处会一起变。`
    : '默认关。?demoEdit=1 才浅拷已加载的路灯片段，不替代实例化。'
  if (button.getAttribute('aria-pressed') === String(on) && button.lastElementChild?.textContent === label && button.title === title) {
    return
  }
  button.setAttribute('aria-pressed', String(on))
  button.setAttribute('aria-label', '图层：浅拷')
  button.title = title
  button.replaceChildren()
  const name = document.createElement('span')
  name.textContent = '浅拷'
  const state = document.createElement('span')
  state.textContent = label
  button.append(name, state)
}

function ensureButton(): void {
  const row = document.querySelector('.viewmark-row')
  if (!row) return
  let host = row.querySelector<HTMLElement>('[data-layer-fragment-clone]')
  if (!host) {
    host = document.createElement('section')
    host.className = 'layer-panel'
    host.dataset.layerFragmentClone = ''
    host.setAttribute('aria-label', '浅拷')
    const list = document.createElement('div')
    list.className = 'layer-list'
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = 'fragmentClone'
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

async function loadClones(): Promise<void> {
  if (Comp) return
  loading ??= import('./FragmentClones').then((mod) => {
    Comp = mod.FragmentClones
  })
  await loading
}

async function sync(): Promise<void> {
  const token = ++syncToken
  on = readOn()
  publish()
  ensureButton()
  if (!on) {
    flush()
    return
  }
  await loadClones()
  if (token !== syncToken) return
  if (!readOn()) {
    on = false
    publish()
    flush()
    return
  }
  flush()
}

/** dock 晚加载之后调用。默认关，不请求 drei Clone。 */
export function mountFragmentClones(): void {
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
  if (on) void sync()
}
