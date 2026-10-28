import { useTwinStore } from '../store/store'
import { acquireChannel, channelBusy, releaseChannel, setSpeechOwns } from './channelLatch'
import { initialSpeechEnabled, initialSpeechMuted, speechSynthesisSupported } from './speechGate'
import {
  clearSpeechQueue,
  createSpeechMemory,
  preferChineseVoice,
  speechFacts,
  utteranceHoldMs,
  watchSpeech,
  type SpeechFact,
  type SpeechMemory,
} from './speechPolicy'

/**
 * T082：告警语音。
 * viewmarks/dock 在首帧 2600ms 之后才 import 本文件，不进 hardGate / balancedFx。
 * 短句只有级别和位置。和 T054 提示音共用声道门闩，不同时出声。
 * 不读时间轴回放，不碰雾、镜头 smoothTime、后处理和 D310。
 */

const BUTTON_STYLE =
  '.topbar .alarm-speech-toggle[aria-pressed="true"]{background:#f4f8fc;color:#0c2340}'

let started = false
let enabled = false
let muted = false
let unlocked = false
let channelOn = false
let spoken = 0
let cancelled = 0
let ticket = 0
let voiceLang: string | null = null
let lastUtterance: string | null = null
let memory: SpeechMemory = createSpeechMemory()
let signature: string | null = null
let timer = 0

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function currentSynth(): SpeechSynthesis | null {
  try {
    return window.speechSynthesis ?? null
  } catch {
    return null
  }
}

function alreadyGestured(): boolean {
  try {
    const activation = navigator.userActivation
    return Boolean(activation?.hasBeenActive || activation?.isActive)
  } catch {
    return false
  }
}

function publish(): void {
  const supported = speechSynthesisSupported()
  window.__twinAlarmSpeech = {
    enabled,
    muted,
    unlocked,
    ownsChannel: enabled && !muted && supported,
    supported,
    spoken,
    cancelled,
    lastUtterance,
    voiceLang,
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

function stopSpeaking(): void {
  ticket += 1
  const synth = currentSynth()
  if (synth) {
    clearSpeechQueue(synth)
    cancelled += 1
  }
  releaseChannel('speech')
}

function beginUtterance(text: string, holdMs: number): boolean {
  const synth = currentSynth()
  if (!synth || typeof SpeechSynthesisUtterance !== 'function') return false
  const hold = holdMs > 0 ? holdMs : utteranceHoldMs(text)
  if (!acquireChannel('speech', now(), hold)) return false
  const generation = ++ticket
  clearSpeechQueue(synth)
  cancelled += 1
  let utter: SpeechSynthesisUtterance
  try {
    utter = new SpeechSynthesisUtterance(text)
  } catch {
    releaseChannel('speech')
    return false
  }
  utter.lang = 'zh-CN'
  voiceLang = 'zh-CN'
  try {
    const voice = preferChineseVoice(synth.getVoices?.() ?? [])
    if (voice) {
      voiceLang = voice.lang || 'zh-CN'
      utter.voice = voice
    }
  } catch {
    // 引擎不收这份语音对象时，仍保留已经选中的 lang。
  }
  const finish = () => {
    if (generation !== ticket) return
    releaseChannel('speech')
  }
  utter.onend = finish
  utter.onerror = finish
  const fire = () => {
    if (generation !== ticket) return
    try {
      synth.speak(utter)
    } catch {
      releaseChannel('speech')
    }
  }
  window.setTimeout(fire, 0)
  return true
}

function readFacts(): SpeechFact[] {
  const state = useTwinStore.getState()
  return speechFacts(state)
}

function consider(force = false): void {
  const facts = readFacts()
  const key = `${enabled ? 1 : 0}|${muted ? 1 : 0}|${unlocked ? 1 : 0}|${facts.map((fact) => fact.id).join('\0')}`
  if (!force && key === signature && memory.merged.length === 0) return
  signature = key
  const previousSpeakAt = memory.lastSpeakAt
  const previousHold = memory.holdUntil
  const decision = watchSpeech(memory, {
    now: now(),
    enabled,
    muted,
    unlocked,
    supported: speechSynthesisSupported(),
    toneBusy: channelBusy(now()) === 'tone',
    facts,
  })
  memory = decision.memory
  if (decision.silenced) {
    if (channelOn || decision.cancel) stopSpeaking()
    channelOn = false
    setSpeechOwns(false)
  } else {
    setSpeechOwns(true)
    channelOn = true
  }
  if (decision.utterance) {
    const said = beginUtterance(decision.utterance, decision.holdMs)
    if (!said) {
      memory = { ...memory, merged: decision.batch, lastSpeakAt: previousSpeakAt, holdUntil: previousHold }
      publish()
      armRetry(280)
      return
    }
    spoken += 1
    lastUtterance = decision.utterance
  }
  publish()
  armRetry(decision.retryInMs)
}

function ensureStyle(): void {
  if (document.querySelector('style[data-alarm-speech]')) return
  const style = document.createElement('style')
  style.dataset.alarmSpeech = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function renderButton(): void {
  const button = ensureButton()
  if (!button) return
  const label = !enabled ? '语音关' : muted ? '已静音' : '语音'
  const pressed = enabled && muted ? 'true' : 'false'
  const mode = !enabled ? 'off' : muted ? 'muted' : 'on'
  if (button.textContent !== label) button.textContent = label
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  if (button.dataset.speech !== mode) button.dataset.speech = mode
  const aria = '告警语音'
  if (button.getAttribute('aria-label') !== aria) button.setAttribute('aria-label', aria)
}

function placeButton(button: HTMLButtonElement, bar: Element): void {
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
  const existing = document.querySelector<HTMLButtonElement>('button.alarm-speech-toggle')
  const bar = document.querySelector('.topbar')
  if (!bar) return existing
  const button = existing ?? document.createElement('button')
  if (!existing) {
    button.type = 'button'
    button.className = 'text-button alarm-speech-toggle'
    button.addEventListener('click', () => {
      if (!enabled) {
        enabled = true
        muted = false
      } else {
        muted = !muted
      }
      unlocked = true
      renderButton()
      consider(true)
    })
  }
  placeButton(button, bar)
  return button
}

function unlockFromGesture(): void {
  const was = unlocked
  unlocked = true
  const synth = currentSynth()
  try {
    synth?.resume()
  } catch {
    // 没在暂停
  }
  if (!was || memory.merged.length > 0) consider(true)
}

function listenForGesture(): void {
  const onGesture = () => unlockFromGesture()
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, true)
}

function listenVoices(): void {
  const synth = currentSynth()
  if (!synth || typeof synth.getVoices !== 'function') return
  const pull = () => {
    try {
      const voice = preferChineseVoice(synth.getVoices())
      voiceLang = voice?.lang ?? (speechSynthesisSupported() ? 'zh-CN' : null)
    } catch {
      voiceLang = speechSynthesisSupported() ? 'zh-CN' : null
    }
    publish()
  }
  pull()
  try {
    synth.addEventListener('voiceschanged', pull)
  } catch {
    synth.onvoiceschanged = pull
  }
}

function watchTopbar(): void {
  const observer = new MutationObserver(() => {
    if (!document.querySelector('button.alarm-speech-toggle')) renderButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/** dock 晚加载之后调用。重复调用不会叠两套监听。 */
export function mountAlarmSpeech(): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return
  started = true
  enabled = initialSpeechEnabled()
  muted = initialSpeechMuted()
  unlocked = alreadyGestured()
  memory = createSpeechMemory()
  publish()
  ensureStyle()
  renderButton()
  watchTopbar()
  listenVoices()
  listenForGesture()
  useTwinStore.subscribe(() => consider())
  consider(true)
}
