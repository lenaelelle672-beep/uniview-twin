/**
 * T085：大屏常亮按钮。
 * dock 在首帧 2600ms 之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉这段，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 点击里同步 `wakeLock.request('screen')`，保住用户手势。
 * 演示模式在挂上时申请。文档不可见不申请。失败不向外抛。
 */
import { createWakeLockController, type WakePorts, type WakeSentinel, type WakeView } from './session'
import { initialWakeLockEnabled, wakeLockForceOff, wakeLockSupported } from './policy'

const BUTTON_STYLE = [
  '.viewmark-dock .viewmark-wake{display:block;width:100%;margin:0 0 6px;box-sizing:border-box}',
  '.viewmark-dock .viewmark-wake[aria-pressed="true"]{background:#d9e8f6}',
].join('')

let started = false
let button: HTMLButtonElement | null = null
let forceOff = false

const controller = createWakeLockController((view) => {
  paint(view)
})

interface WakeHost {
  wakeLock?: { request?: (type: 'screen') => Promise<WakeSentinel> } | null
  isSecureContext?: boolean
}

function wakeHost(): WakeHost | null {
  try {
    if (typeof navigator === 'undefined') return null
    const host = navigator as Navigator & WakeHost
    return {
      wakeLock: host.wakeLock ?? null,
      isSecureContext: typeof window === 'undefined' ? undefined : window.isSecureContext,
    }
  } catch {
    return null
  }
}

function supportedNow(): boolean {
  return wakeLockSupported(wakeHost())
}

function visibleNow(): boolean {
  try {
    return document.visibilityState === 'visible'
  } catch {
    return false
  }
}

function browserPorts(): WakePorts {
  return {
    visible: visibleNow(),
    supported: supportedNow(),
    request: (type) => {
      const api = wakeHost()?.wakeLock
      if (!api || typeof api.request !== 'function') return Promise.reject(new Error('no-wake-lock'))
      return api.request(type)
    },
  }
}

function label(view: WakeView): string {
  if (!view.enabled) return '常亮关'
  if (view.held) return '常亮开'
  return '常亮'
}

function paint(view: WakeView): void {
  const node = button
  const supported = supportedNow()
  const visible = visibleNow()
  if (node) {
    const text = label(view)
    if (node.textContent !== text) node.textContent = text
    const pressed = view.enabled ? 'true' : 'false'
    if (node.getAttribute('aria-pressed') !== pressed) node.setAttribute('aria-pressed', pressed)
    const aria = !view.enabled ? '保持屏幕常亮' : view.held ? '关闭屏幕常亮' : '屏幕没有保持常亮'
    if (node.getAttribute('aria-label') !== aria) node.setAttribute('aria-label', aria)
    const title = forceOff
      ? '地址栏带 ?wakeLock=0，已关闭常亮'
      : !supported
        ? '当前环境不能保持常亮'
        : !view.enabled
          ? '保持屏幕常亮。再点一次关闭'
          : view.held
            ? '屏幕保持常亮。再点一次关闭'
            : visible
              ? '没有锁住屏幕'
              : '页面不可见，不锁定屏幕'
    if (node.title !== title) node.title = title
    node.disabled = forceOff || !supported
  }
  publish(view, supported, visible)
}

function publish(view: WakeView, supported: boolean, visible: boolean): void {
  try {
    if (typeof window === 'undefined') return
    window.__twinWakeLock = {
      enabled: view.enabled,
      held: view.held,
      phase: view.phase,
      supported,
      visible,
      forceOff,
      setOn: (on) => {
        try {
          if (forceOff) return
          if (on) controller.enable(browserPorts())
          else controller.disable(browserPorts())
        } catch {
          // 外部开关失败也不抛。
        }
      },
    }
  } catch {
    // 探针写不进去也不抛。
  }
}

function ensureStyle(): void {
  if (document.querySelector('style[data-wake-lock]')) return
  const style = document.createElement('style')
  style.dataset.wakeLock = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function onClick(): void {
  try {
    if (forceOff || !supportedNow()) return
    const view = controller.view()
    if (view.enabled) controller.disable(browserPorts())
    else controller.enable(browserPorts())
  } catch {
    paint(controller.view())
  }
}

function ensureButton(): void {
  const dock = document.querySelector('.viewmark-dock')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'viewmark-wake'
    button.dataset.wakeLock = ''
    button.addEventListener('click', onClick)
  }
  paint(controller.view())
  if (!dock || button.parentElement === dock) return
  dock.append(button)
}

function onVisibility(): void {
  try {
    controller.onVisibility(browserPorts())
  } catch {
    paint(controller.view())
  }
}

/** dock 晚加载之后调用。重复调用不会叠两套按钮。没有 document 时直接返回。 */
export function mountScreenWakeLock(): void {
  if (started || typeof document === 'undefined') return
  started = true
  try {
    forceOff = wakeLockForceOff()
    ensureStyle()
    document.addEventListener('visibilitychange', onVisibility)
    if (!forceOff && initialWakeLockEnabled()) controller.enable(browserPorts())
    else paint(controller.view())
    ensureButton()
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
