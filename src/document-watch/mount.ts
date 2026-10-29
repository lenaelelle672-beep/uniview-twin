/**
 * T087：文档值守按钮。
 * dock 在首帧 2600ms 之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉这段，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 点击里同步 requestWindow，不在手势之后再动态 import。
 * 小窗只挂告警 DOM。离开页面才关窗。不监听全屏事件，也不进多标签总线。
 */
import { useTwinStore } from '../store/store'
import { paintDocumentWatch, type WatchRow } from './panel'
import {
  documentWatchButton,
  documentWatchDisabled,
  documentWatchSupported,
  type CanvasSeat,
  type DocumentWatchOpenOptions,
  type DocumentWatchPhase,
} from './policy'
import { createDocumentWatchController, type DocumentWatchPorts, type DocumentWatchWindow } from './session'

const BUTTON_STYLE = [
  '.viewmark-dock .viewmark-docwatch{display:block;width:100%;margin:0 0 6px;box-sizing:border-box}',
  '.viewmark-dock .viewmark-docwatch[aria-pressed="true"]{background:#d9e8f6}',
].join('')

const controller = createDocumentWatchController()
let started = false
let button: HTMLButtonElement | null = null

function requestWindow(options: DocumentWatchOpenOptions): Promise<DocumentWatchWindow> {
  const api = window.documentPictureInPicture
  if (!api || typeof api.requestWindow !== 'function') return Promise.reject(new Error('unavailable'))
  return api.requestWindow(options) as unknown as Promise<DocumentWatchWindow>
}

function canvasHome(): CanvasSeat | null {
  const node = document.querySelector('.scene-root canvas')
  if (!node) return null
  const parent = node.parentElement
  if (!parent) return { node, parent: null }
  return { node, parent }
}

function focusOpener(): void {
  try {
    window.focus()
  } catch {
    // 主页面拒绝聚焦也不抛。
  }
  try {
    button?.focus()
  } catch {
    // 按钮不在树上也不抛。
  }
}

function focusAlarm(row: WatchRow): void {
  if (!row.floorId) return
  useTwinStore.getState().focusDevice({
    floor: row.floorId,
    deskId: null,
    deviceId: row.deviceId || null,
  })
}

function publish(): void {
  let alarms = 0
  try {
    alarms = useTwinStore.getState().alarms.length
  } catch {
    alarms = 0
  }
  window.__twinDocumentWatch = {
    phase: controller.phase(),
    supported: documentWatchSupported(),
    disabled: documentWatchDisabled(),
    alarms,
  }
}

function paintButton(phase: DocumentWatchPhase): void {
  if (!button) return
  const view = documentWatchButton({
    phase,
    disabled: documentWatchDisabled(),
    supported: documentWatchSupported(),
  })
  if (button.textContent !== view.text) button.textContent = view.text
  if (button.getAttribute('aria-pressed') !== view.pressed) button.setAttribute('aria-pressed', view.pressed)
  if (button.getAttribute('aria-label') !== view.label) button.setAttribute('aria-label', view.label)
  if (button.title !== view.title) button.title = view.title
  button.disabled = view.disabled
  publish()
}

function browserPorts(gesture: boolean): DocumentWatchPorts {
  return {
    disabled: documentWatchDisabled(),
    supported: documentWatchSupported(),
    gesture,
    openerDocument: document,
    requestWindow,
    readState: () => {
      try {
        return useTwinStore.getState()
      } catch {
        return null
      }
    },
    subscribe: (listener) => useTwinStore.subscribe(listener),
    paint: paintDocumentWatch,
    focusOpener,
    focusAlarm,
    canvasHome,
    onPhase: (phase) => paintButton(phase),
    onModel: () => publish(),
  }
}

function onClick(): void {
  try {
    const phase = controller.enter(browserPorts(true))
    paintButton(phase)
  } catch {
    paintButton(controller.phase())
  }
}

function ensureStyle(): void {
  if (document.querySelector('style[data-document-watch-style]')) return
  const style = document.createElement('style')
  style.dataset.documentWatchStyle = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function ensureButton(): void {
  const dock = document.querySelector('.viewmark-dock')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'viewmark-docwatch'
    button.dataset.documentWatchButton = ''
    button.addEventListener('click', onClick)
  }
  paintButton(controller.phase())
  if (!dock || button.parentElement === dock) return
  dock.append(button)
}

function onPageHide(): void {
  try {
    controller.exit(browserPorts(false))
  } catch {
    // 离开页面时关不上也不抛。
  }
}

/** dock 晚加载之后调用。重复调用不会叠两套按钮。没有 document 时直接返回。 */
export function mountDocumentWatch(): void {
  if (started || typeof document === 'undefined') return
  started = true
  try {
    ensureStyle()
    ensureButton()
    window.addEventListener('pagehide', onPageHide)
    const observer = new MutationObserver(() => {
      try {
        if (!button || !button.isConnected) ensureButton()
      } catch {
        // 挂不上按钮也不抛。
      }
    })
    if (document.body) observer.observe(document.body, { childList: true, subtree: true })
  } catch {
    // 挂不上也不抛。
  }
}
