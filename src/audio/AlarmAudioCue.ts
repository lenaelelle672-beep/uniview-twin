import { useTwinStore } from '../store/store'
import { acquireChannel, decideToneOutput, setSpeechOwns } from './channelLatch'
import {
  alarmFocusKey,
  createCueMemory,
  initialMuteAudio,
  watchAlarms,
  type CueMemory,
  type CueReason,
  type CueWatch,
} from './cuePolicy'
import { CUE_DURATION_MS, openCueContext, playAlarmCue, resumeCueContext, type CueAudioContext } from './dualTone'
import { initialSpeechEnabled, initialSpeechMuted, speechSynthesisSupported } from './speechGate'

/**
 * T054：告警提示音。
 * viewmarks/dock 在首帧 2600ms 之后才 import 本文件，不进 hardGate / balancedFx。
 * 不读时间轴回放，不碰 DeskFlash、描边、雾、镜头 smoothTime 和后处理。
 * T082 语音接过声道时，这一声让出去，不和语音叠在一起响。
 * T084 桌面通知在文档 hidden 且已允许时接过这一次，这一声也让出去。
 */

const BUTTON_STYLE =
  '.topbar .alarm-audio-mute[aria-pressed="true"]{background:#f4f8fc;color:#0c2340}'

let started = false
let muted = false
let unlocked = false
let played = 0
let lastReason: CueReason | null = null
let memory: CueMemory = createCueMemory()
let context: CueAudioContext | null = null
let signature: string | null = null
let timer = 0

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function readWatch(): CueWatch {
  const state = useTwinStore.getState()
  return {
    now: now(),
    muted,
    unlocked,
    alarmIds: state.alarms.map((alarm) => alarm.id),
    focusKey: alarmFocusKey(state.focusedDeviceId, state.focusedDeskId, state.devices, state.alarms),
  }
}

function watchKey(watch: CueWatch): string {
  return `${watch.muted ? 1 : 0}|${watch.unlocked ? 1 : 0}|${watch.focusKey ?? ''}|${watch.alarmIds.join('\0')}`
}

function publish(playedNow: boolean): void {
  window.__twinAlarmAudio = {
    muted,
    unlocked,
    played,
    lastReason: playedNow ? lastReason : (window.__twinAlarmAudio?.lastReason ?? null),
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
  }, ms + 16)
}

function consider(force = false): void {
  const watch = readWatch()
  const next = watchKey(watch)
  if (!force && next === signature && memory.pending == null) return
  signature = next
  const previousCueAt = memory.lastCueAt
  const decision = watchAlarms(memory, watch)
  memory = decision.memory
  let playedNow = false
  if (decision.play && decision.reason) {
    const output = decideToneOutput(now())
    if (output === 'yield') {
      lastReason = decision.reason
    } else if (output === 'wait') {
      memory = { ...memory, pending: decision.reason, lastCueAt: previousCueAt }
      publish(false)
      armRetry(280)
      return
    } else if (playAlarmCue(context)) {
      acquireChannel('tone', now(), CUE_DURATION_MS)
      playedNow = true
      lastReason = decision.reason
      played += 1
    } else {
      memory = { ...memory, pending: decision.reason, lastCueAt: previousCueAt }
      unlocked = context?.state === 'running'
    }
  }
  publish(playedNow)
  armRetry(decision.play && !playedNow ? null : decision.retryInMs)
}

function ensureStyle(): void {
  if (document.querySelector('style[data-alarm-audio]')) return
  const style = document.createElement('style')
  style.dataset.alarmAudio = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function renderButton(): void {
  const button = ensureButton()
  if (!button) return
  const label = muted ? '已静音' : '提示音'
  const pressed = muted ? 'true' : 'false'
  if (button.textContent !== label) button.textContent = label
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  const aria = '告警提示音'
  if (button.getAttribute('aria-label') !== aria) button.setAttribute('aria-label', aria)
}

function ensureButton(): HTMLButtonElement | null {
  const existing = document.querySelector<HTMLButtonElement>('button.alarm-audio-mute')
  if (existing) return existing
  const bar = document.querySelector('.topbar')
  if (!bar) return null
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'text-button alarm-audio-mute'
  button.addEventListener('click', () => {
    muted = !muted
    renderButton()
    consider(true)
  })
  const search = bar.querySelector('.search-wrap')
  if (search) bar.insertBefore(button, search)
  else bar.append(button)
  return button
}

function unlockFromGesture(): void {
  context = context ?? openCueContext()
  if (!context) return
  const finish = () => {
    unlocked = context?.state === 'running'
    if (unlocked) consider(true)
  }
  if (context.state === 'running') {
    finish()
    return
  }
  void resumeCueContext(context).then(finish)
}

function listenForGesture(): void {
  const onGesture = () => unlockFromGesture()
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, true)
}

function watchTopbar(): void {
  const observer = new MutationObserver(() => {
    if (!document.querySelector('button.alarm-audio-mute')) renderButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * 语音分包还没挂上时，先按地址栏把声道让出去。
 * 语音已经挂上之后不再覆盖，避免把用户刚点的开关冲掉。
 */
function adoptSpeechChannel(): void {
  if (window.__twinAlarmSpeech) return
  setSpeechOwns(initialSpeechEnabled() && !initialSpeechMuted() && speechSynthesisSupported())
}

/** dock 晚加载之后调用。重复调用不会叠两套监听。 */
export function mountAlarmAudioCue(): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return
  started = true
  muted = initialMuteAudio()
  adoptSpeechChannel()
  memory = createCueMemory()
  ensureStyle()
  renderButton()
  watchTopbar()
  listenForGesture()
  useTwinStore.subscribe(() => consider())
  consider(true)
}
