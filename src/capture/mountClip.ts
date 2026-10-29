/**
 * T062：录制按钮。
 * dock 在首帧 2600ms 之后才 import 本文件，不进 hardGate / balancedFx。
 * 点击里同步 captureStream + MediaRecorder.start，不在手势之后再动态 import。
 */
import { createClipController, type ClipCanvas, type ClipPhase, type ClipPorts } from './clipSession'
import { pickClipMime, rootStateFromScene } from './clipPolicy'

const BUTTON_STYLE = [
  '.viewmark-dock .viewmark-clip{display:block;width:100%;margin:0 0 6px;box-sizing:border-box}',
  '.viewmark-dock .viewmark-clip[aria-pressed="true"]{background:#d9e8f6}',
].join('')

const controller = createClipController()
let started = false
let button: HTMLButtonElement | null = null

function label(phase: ClipPhase): string {
  return phase === 'recording' ? '停止' : '录制'
}

function paint(node: HTMLButtonElement, phase: ClipPhase): void {
  const text = label(phase)
  if (node.textContent !== text) node.textContent = text
  const pressed = phase === 'recording' ? 'true' : 'false'
  if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed)
  const aria = phase === 'recording' ? '停止录制' : '录制画面'
  if (node.getAttribute('aria-label') !== aria) node.setAttribute('aria-label', aria)
}

function ensureStyle(): void {
  if (document.querySelector('style[data-clip-capture]')) return
  const style = document.createElement('style')
  style.dataset.clipCapture = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function largestCanvas(): ClipCanvas | null {
  const nodes = document.querySelectorAll('.scene-root canvas')
  let best: ClipCanvas | null = null
  let area = -1
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i] as Partial<ClipCanvas> | null
    if (!node || typeof node.captureStream !== 'function') continue
    const width = node.width ?? 0
    const height = node.height ?? 0
    const next = width * height
    if (next < area) continue
    area = next
    best = node as ClipCanvas
  }
  return best
}

function browserMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  if (typeof MediaRecorder.isTypeSupported !== 'function') return 'video/webm'
  return pickClipMime((mime) => MediaRecorder.isTypeSupported(mime))
}

export function downloadClip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function browserPorts(): ClipPorts {
  return {
    canvas: largestCanvas(),
    frameloop: rootStateFromScene(window.__twinScene ?? null),
    now: () => performance.now(),
    mime: browserMime(),
    createRecorder: (stream, mime) => new MediaRecorder(stream as MediaStream, { mimeType: mime }),
    download: downloadClip,
    kickFrame: () => {
      const kick = window.__twinInvalidate
      if (kick) return kick()
      window.__vpP?.()
    },
    raf: (fn) => {
      requestAnimationFrame(() => fn())
    },
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    clear: (id) => window.clearTimeout(id),
    onPhase: (phase) => {
      if (button) paint(button, phase)
    },
  }
}

function onClick(): void {
  try {
    const phase = controller.toggle(browserPorts())
    if (button) paint(button, phase)
  } catch {
    if (button) paint(button, 'idle')
  }
}

function ensureButton(): void {
  const dock = document.querySelector('.viewmark-dock')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'viewmark-clip'
    button.dataset.clipCapture = ''
    button.addEventListener('click', onClick)
  }
  paint(button, controller.phase())
  if (!dock || button.parentElement === dock) return
  const share = dock.querySelector('[data-share-shot]')
  if (share?.parentElement === dock) dock.insertBefore(button, share.nextSibling)
  else dock.append(button)
}

/** dock 晚加载之后调用。重复调用不会叠两套按钮。没有 document 时直接返回。 */
export function mountClipCapture(): void {
  if (started || typeof document === 'undefined') return
  started = true
  try {
    ensureStyle()
    ensureButton()
    const observer = new MutationObserver(() => {
      try {
        if (!button || !button.isConnected) ensureButton()
      } catch {
        // 禁录路径不抛。
      }
    })
    if (document.body) observer.observe(document.body, { childList: true, subtree: true })
  } catch {
    // 挂不上按钮也不抛。
  }
}
