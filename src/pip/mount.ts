/**
 * T083：画中画值守按钮。
 * dock 在首帧 2600ms 之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉这段，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 点击里同步 captureStream + requestPictureInPicture，不在手势之后再动态 import。
 * 页面藏到后台仍继续值守；离开页面才拆流。不监听全屏事件。
 */
import { createPipController, type PipCanvas, type PipPhase, type PipPorts, type PipVideo } from './session'
import { pipApiAvailable, pipDisabled } from './policy'

const BUTTON_STYLE = [
  '.viewmark-dock .viewmark-pip{display:block;width:100%;margin:0 0 6px;box-sizing:border-box}',
  '.viewmark-dock .viewmark-pip[aria-pressed="true"]{background:#d9e8f6}',
].join('')

const controller = createPipController()
let started = false
let button: HTMLButtonElement | null = null
let video: HTMLVideoElement | null = null

function label(phase: PipPhase): string {
  return phase === 'open' ? '退出画中画' : '画中画'
}

function paint(node: HTMLButtonElement, phase: PipPhase, disabled: boolean, supported: boolean): void {
  const text = label(phase)
  if (node.textContent !== text) node.textContent = text
  const pressed = phase === 'open' ? 'true' : 'false'
  if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed)
  const aria = phase === 'open' ? '退出画中画，回到主视图' : '画中画值守'
  if (node.getAttribute('aria-label') !== aria) node.setAttribute('aria-label', aria)
  const title = disabled
    ? '地址栏带 ?nopip=1，已关闭画中画'
    : !supported
      ? '当前浏览器不能画中画'
      : phase === 'open'
        ? '退出画中画，回到主视图'
        : '把当前画面放进画中画。退出后回到主视图'
  if (node.title !== title) node.title = title
  node.disabled = disabled || !supported
}

function ensureStyle(): void {
  if (document.querySelector('style[data-pip-watch]')) return
  const style = document.createElement('style')
  style.dataset.pipWatch = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function largestCanvas(): PipCanvas | null {
  const nodes = document.querySelectorAll('.scene-root canvas')
  let best: PipCanvas | null = null
  let area = -1
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i] as Partial<PipCanvas> | null
    if (!node || typeof node.captureStream !== 'function') continue
    const width = node.width ?? 0
    const height = node.height ?? 0
    const next = width * height
    if (next < area) continue
    area = next
    best = node as PipCanvas
  }
  return best
}

function pipSupported(): boolean {
  const proto = typeof HTMLVideoElement === 'undefined' ? undefined : HTMLVideoElement.prototype
  return pipApiAvailable({
    pictureInPictureEnabled: document.pictureInPictureEnabled,
    requestPictureInPicture: proto?.requestPictureInPicture,
  })
}

function ensureVideo(): HTMLVideoElement {
  if (video?.isConnected) return video
  const node = document.createElement('video')
  node.muted = true
  node.defaultMuted = true
  node.volume = 0
  node.controls = false
  node.autoplay = false
  node.playsInline = true
  node.disablePictureInPicture = false
  node.setAttribute('muted', '')
  node.setAttribute('playsinline', '')
  node.setAttribute('aria-hidden', 'true')
  node.tabIndex = -1
  node.dataset.pipVideo = ''
  node.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none'
  document.body.append(node)
  video = node
  return node
}

function browserPorts(): PipPorts {
  const node = ensureVideo()
  const sink = node as HTMLVideoElement & PipVideo
  return {
    disabled: pipDisabled(),
    supported: pipSupported(),
    canvas: largestCanvas(),
    video: sink,
    activeElement: document.pictureInPictureElement,
    exitPictureInPicture: () => document.exitPictureInPicture(),
    kickFrame: () => {
      const kick = window.__twinInvalidate
      if (kick) return kick()
      window.__vpP?.()
    },
    schedule: (fn, ms) => window.setTimeout(fn, ms),
    clear: (id) => window.clearTimeout(id),
    onPhase: (phase) => {
      if (button) paint(button, phase, pipDisabled(), pipSupported())
    },
  }
}

function onClick(): void {
  try {
    const phase = controller.enter(browserPorts())
    if (button) paint(button, phase, pipDisabled(), pipSupported())
  } catch {
    if (button) paint(button, 'idle', pipDisabled(), pipSupported())
  }
}

function ensureButton(): void {
  const dock = document.querySelector('.viewmark-dock')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'viewmark-pip'
    button.dataset.pipWatch = ''
    button.addEventListener('click', onClick)
  }
  paint(button, controller.phase(), pipDisabled(), pipSupported())
  if (!dock || button.parentElement === dock) return
  dock.append(button)
}

function onPageHide(): void {
  try {
    if (controller.phase() !== 'open' && document.pictureInPictureElement == null) return
    controller.exit(browserPorts())
  } catch {
    // 离开页面时拆不掉也不抛。
  }
}

/** dock 晚加载之后调用。重复调用不会叠两套按钮。没有 document 时直接返回。 */
export function mountPipWatch(): void {
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
