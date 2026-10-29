import { setNotifyCovers } from '../audio/channelLatch'
import { speechFacts } from '../audio/speechPolicy'
import { useTwinStore } from '../store/store'
import {
  initialNotifyEnabled,
  readNotifyPermission,
  requestNotifyPermission,
  showDesktopAlarm,
  type NotifyHandle,
  type NotifyHost,
  type NotifyPermission,
} from './notifyGate'
import { createNotifyMemory, watchNotify, type NotifyFact, type NotifyMemory } from './notifyPolicy'

/**
 * T084：告警桌面通知。
 * viewmarks/dock 在首帧 2600ms 之后才 import 本文件，不进 hardGate / balancedFx。
 * 用户手势之后才 requestPermission。告警入队且文档 hidden 时弹一条。
 * 权限拒绝或非安全上下文则静默降级，不挡页面。
 * 接手时提示音和语音让出，三路不同时响。
 */

const BUTTON_STYLE = '.topbar .alarm-notify-toggle[aria-pressed="true"]{background:#f4f8fc;color:#0c2340}'

let started = false
let enabled = false
let permission: NotifyPermission = 'unsupported'
let asking = false
let shown = 0
let lastBody: string | null = null
let memory: NotifyMemory = createNotifyMemory()
let signature: string | null = null
let timer = 0
let openNote: NotifyHandle | null = null

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function browserHost(): NotifyHost {
  const api = typeof Notification === 'function' ? Notification : undefined
  return {
    isSecureContext: window.isSecureContext,
    Notification: api,
  }
}

function pageHidden(): boolean {
  try {
    return document.hidden === true
  } catch {
    return false
  }
}

function syncCover(): void {
  setNotifyCovers(enabled && permission === 'granted')
}

function closeOpen(): void {
  const note = openNote
  openNote = null
  if (!note || typeof note.close !== 'function') return
  try {
    note.close()
  } catch {
    // 系统已经收掉
  }
}

function publish(): void {
  window.__twinAlarmNotify = {
    enabled,
    permission,
    supported: permission !== 'unsupported',
    hidden: pageHidden(),
    shown,
    lastBody,
  }
}

function armRetry(ms: number | null): void {
  if (timer) {
    window.clearTimeout(timer)
    timer = 0
  }
  if (ms == null) return
  timer = window.setTimeout(() => {
    timer = 0
    consider(true)
  }, Math.max(0, ms) + 16)
}

function readFacts(): NotifyFact[] {
  return speechFacts(useTwinStore.getState())
}

function consider(force = false): void {
  const facts = readFacts()
  const hidden = pageHidden()
  const key = `${enabled ? 1 : 0}|${permission}|${hidden ? 1 : 0}|${facts.map((fact) => fact.id).join('\0')}`
  if (!force && key === signature && memory.pending.length === 0) return
  signature = key
  const decision = watchNotify(memory, {
    now: now(),
    enabled,
    permitted: permission === 'granted',
    hidden,
    facts,
  })
  memory = decision.memory
  if (decision.body) {
    closeOpen()
    const handle = showDesktopAlarm(browserHost(), decision.body)
    if (!handle) {
      permission = permission === 'granted' ? 'unsupported' : permission
      syncCover()
    } else {
      openNote = handle
      shown += 1
      lastBody = decision.body
    }
  } else if (!enabled) {
    closeOpen()
  }
  publish()
  renderButton()
  armRetry(decision.retryInMs)
}

function applyPermission(next: NotifyPermission): void {
  asking = false
  permission = next
  syncCover()
  consider(true)
}

function askIfNeeded(): void {
  if (!enabled || permission !== 'default' || asking) return
  asking = true
  void requestNotifyPermission(browserHost()).then(applyPermission, () => applyPermission('denied'))
}

function ensureStyle(): void {
  if (document.querySelector('style[data-alarm-notify]')) return
  const style = document.createElement('style')
  style.dataset.alarmNotify = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function renderButton(): void {
  const button = ensureButton()
  if (!button) return
  const label = enabled ? '通知' : '通知关'
  const pressed = enabled ? 'true' : 'false'
  const mode = !enabled ? 'off' : permission
  if (button.textContent !== label) button.textContent = label
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  if (button.dataset.notify !== mode) button.dataset.notify = mode
  const aria = '告警桌面通知'
  if (button.getAttribute('aria-label') !== aria) button.setAttribute('aria-label', aria)
  const title = !enabled
    ? '桌面通知关着'
    : permission === 'granted'
      ? '切到别的标签时弹出新告警'
      : permission === 'denied'
        ? '浏览器没有允许通知'
        : permission === 'default'
          ? '点一下才会向浏览器请求通知权限'
          : '当前页面不能发桌面通知'
  if (button.title !== title) button.title = title
}

function placeButton(button: HTMLButtonElement, bar: Element): void {
  const speech = bar.querySelector('.alarm-speech-toggle')
  if (speech) {
    if (button.previousSibling !== speech) bar.insertBefore(button, speech.nextSibling)
    return
  }
  const audio = bar.querySelector('.alarm-audio-mute')
  if (audio) {
    if (button.previousSibling !== audio) bar.insertBefore(button, audio.nextSibling)
    return
  }
  const search = bar.querySelector('.search-wrap')
  if (search) {
    if (button.nextSibling !== search) bar.insertBefore(button, search)
    return
  }
  if (!button.isConnected) bar.append(button)
}

function ensureButton(): HTMLButtonElement | null {
  const existing = document.querySelector<HTMLButtonElement>('button.alarm-notify-toggle')
  const bar = document.querySelector('.topbar')
  if (!bar) return existing
  const button = existing ?? document.createElement('button')
  if (!existing) {
    button.type = 'button'
    button.className = 'text-button alarm-notify-toggle'
    button.addEventListener('click', () => {
      enabled = !enabled
      if (!enabled) closeOpen()
      renderButton()
      syncCover()
      if (enabled) askIfNeeded()
      consider(true)
    })
  }
  placeButton(button, bar)
  return button
}

function isToggleTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const node = target as { closest?: (selector: string) => unknown }
  if (typeof node.closest !== 'function') return false
  return Boolean(node.closest('button.alarm-notify-toggle'))
}

function listenForGesture(): void {
  const onGesture = (event: Event) => {
    if (isToggleTarget(event.target)) return
    askIfNeeded()
  }
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, true)
}

function watchTopbar(): void {
  const observer = new MutationObserver(() => {
    if (!document.querySelector('button.alarm-notify-toggle')) renderButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/** dock 晚加载之后调用。重复调用不会叠两套监听。 */
export function mountAlarmNotify(): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return
  started = true
  enabled = initialNotifyEnabled()
  permission = readNotifyPermission(browserHost())
  memory = createNotifyMemory()
  syncCover()
  publish()
  ensureStyle()
  renderButton()
  watchTopbar()
  listenForGesture()
  document.addEventListener('visibilitychange', () => consider(true))
  useTwinStore.subscribe(() => consider())
  consider(true)
}
