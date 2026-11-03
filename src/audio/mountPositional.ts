/**
 * T108：告警空间音挂载点。
 * dock 在首帧之后才 import。默认关，不创建音频上下文，也不请求图纸。
 * 打开并且手势解锁之后，才把一只 PositionalAudio 送进画布槽。
 * 和提示音、语音共用声道门闩。认领得上的那一声，提示音让出。
 */

import { createElement, Fragment, Suspense, type ReactNode } from 'react'
import { floorSpec } from '../data/floors'
import { floorJsonFile } from '../floors/deskCounts'
import { AudioContext } from 'three'
import { useTwinStore } from '../store/store'
import { acquireChannel, bindSpatialClaim, channelBusy, notifyCoversHidden, speechOwnsChannel } from './channelLatch'
import { alarmFocusKey, createCueMemory, watchAlarms, type CueMemory, type CueReason } from './cuePolicy'
import { CUE_DURATION_MS } from './dualTone'
import { PositionalCue } from './PositionalCue'
import { desksFromPlan, flatPoint, type DeskFlat } from './positionalPlace'
import {
  ALARM_REF_DISTANCE,
  anchorForReason,
  initialSpatialEnabled,
  initialSpatialMuted,
  sourcePosition,
  type SpatialAnchor,
  type SpatialSource,
} from './positionalPolicy'
import { encodeCueWav } from './positionalTone'
import { createSpatialSlot, type SpatialSlot } from './spatialSlot'

const BUTTON_STYLE =
  '.topbar .alarm-spatial-toggle[aria-pressed="true"]{background:#f4f8fc;color:#0c2340}'

let started = false
let enabled = false
let muted = false
let unlocked = false
let played = 0
let playToken = 0
let memory: CueMemory = createCueMemory()
let signature: string | null = null
let timer = 0
let url: string | null = null
let anchor: SpatialAnchor | null = null
let place: { x: number; y: number; z: number } | null = null
let sibling: ReactNode = null
let posted = ''
let plans = new Map<string, DeskFlat[]>()
const planLoads = new Map<string, Promise<void>>()

function now(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function audioApi(): boolean {
  try {
    const host = window as Window & { webkitAudioContext?: typeof AudioContext }
    return typeof window.AudioContext === 'function' || typeof host.webkitAudioContext === 'function'
  } catch {
    return false
  }
}

function readSource(): SpatialSource {
  const state = useTwinStore.getState()
  return {
    alarms: state.alarms,
    devices: state.devices,
    focusedDeviceId: state.focusedDeviceId,
    focusedDeskId: state.focusedDeskId,
  }
}

function explodeLift(floorId: string): number {
  const rows = window.__twinExplode?.floors
  if (!rows) return 0
  return rows.find((floor) => floor.id === floorId)?.offset ?? 0
}

function liveDesks(floorId: string): DeskFlat[] | null {
  const live = window.__twinFloor
  if (!live || live.floorId !== floorId) return null
  return live.desks
}

function pointOf(next: SpatialAnchor): { x: number; y: number; z: number } | null {
  const flat = flatPoint(next, liveDesks(next.floorId), plans)
  if (!flat) return null
  let elevation = 0
  try {
    elevation = floorSpec(next.floorId).elevation
  } catch {
    return null
  }
  return sourcePosition(flat, elevation, explodeLift(next.floorId))
}

function claims(reason: 'enqueue' | 'focus'): boolean {
  if (!enabled || muted || !audioApi()) return false
  const next = anchorForReason(reason, readSource())
  if (!next) return false
  return pointOf(next) != null
}

function publish(claimsNow = claimsPreview()): void {
  window.__twinPositionalAudio = {
    enabled,
    muted,
    unlocked,
    played,
    refDistance: ALARM_REF_DISTANCE,
    claims: claimsNow,
    listener: window.__twinPositionalAudio?.listener === true,
    floorId: anchor?.floorId ?? null,
    deskId: anchor?.deskId ?? null,
    place: place ? { x: place.x, y: place.y, z: place.z } : null,
  }
}

function claimsPreview(): boolean {
  if (!enabled || muted || !audioApi()) return false
  const source = readSource()
  const focusKey = alarmFocusKey(source.focusedDeviceId, source.focusedDeskId, source.devices, source.alarms)
  if (focusKey && claims('focus')) return true
  return source.alarms.length > 0 && claims('enqueue')
}

function ensureUrl(): string | null {
  if (url) return url
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  try {
    url = URL.createObjectURL(new Blob([encodeCueWav().buffer as ArrayBuffer], { type: 'audio/wav' }))
    return url
  } catch {
    return null
  }
}

function showCue(): boolean {
  return enabled && !muted && unlocked && url != null && place != null
}

function composed(): ReactNode {
  const node =
    showCue() && place && url
      ? createElement(
          Suspense,
          { fallback: null },
          createElement(PositionalCue, {
            url,
            playToken,
            distance: ALARM_REF_DISTANCE,
            position: [place.x, place.y, place.z] as const,
          }),
        )
      : null
  if (node && sibling != null) return createElement(Fragment, null, sibling, node)
  return node ?? sibling ?? null
}

function deliver(node: unknown, upstream: (node: unknown) => void, force: boolean): void {
  sibling = node as ReactNode
  const visible = showCue()
  const key = visible && place && url ? `${playToken}|${url}|${place.x}|${place.y}|${place.z}` : ''
  if (!force && key === posted) return
  posted = key
  upstream(composed())
}

const slotBridge = createSpatialSlot({
  read: () => window.__twinMeasureSlot as SpatialSlot | undefined,
  write: (slot) => {
    window.__twinMeasureSlot = slot as Window['__twinMeasureSlot']
  },
  deliver,
})

function flush(force: boolean): void {
  slotBridge.push(sibling, force)
}

function wrapMeasureSlot(): void {
  if (!slotBridge.wrap()) return
  if (showCue()) flush(true)
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

function outputNow(): 'yield' | 'wait' | 'play' {
  if (notifyCoversHidden()) return 'yield'
  if (speechOwnsChannel()) return 'yield'
  const busy = channelBusy(now())
  if (busy === 'speech' || busy === 'notify' || busy === 'tone') return 'wait'
  return 'play'
}

function remember(anchorNext: SpatialAnchor | null, placeNext: { x: number; y: number; z: number } | null): void {
  anchor = anchorNext
  place = placeNext
}

function consider(force = false): void {
  const source = readSource()
  const watch = {
    now: now(),
    muted: !enabled || muted,
    unlocked,
    alarmIds: source.alarms.map((alarm) => alarm.id),
    focusKey: alarmFocusKey(source.focusedDeviceId, source.focusedDeskId, source.devices, source.alarms),
  }
  const key = `${watch.muted ? 1 : 0}|${watch.unlocked ? 1 : 0}|${watch.focusKey ?? ''}|${watch.alarmIds.join('\0')}|${explodeLift(anchor?.floorId ?? '')}`
  if (!force && key === signature && memory.pending == null) return
  signature = key
  const previousCueAt = memory.lastCueAt
  const decision = watchAlarms(memory, watch)
  memory = decision.memory
  const reason: CueReason | null = decision.reason
  const nextAnchor = reason ? anchorForReason(reason, source) : anchor
  const nextPlace = nextAnchor ? pointOf(nextAnchor) : null
  if (!decision.play || !reason) {
    if (nextAnchor && nextPlace) remember(nextAnchor, nextPlace)
    publish()
    flush(false)
    armRetry(decision.retryInMs)
    return
  }
  if (!nextAnchor || !nextPlace || !ensureUrl()) {
    publish(false)
    flush(false)
    armRetry(null)
    return
  }
  remember(nextAnchor, nextPlace)
  const output = outputNow()
  if (output === 'yield') {
    publish(true)
    flush(false)
    armRetry(null)
    return
  }
  if (output === 'wait') {
    memory = { ...memory, pending: reason, lastCueAt: previousCueAt }
    publish(true)
    flush(false)
    armRetry(280)
    return
  }
  if (!acquireChannel('tone', now(), CUE_DURATION_MS)) {
    memory = { ...memory, pending: reason, lastCueAt: previousCueAt }
    publish(true)
    armRetry(280)
    return
  }
  playToken += 1
  played += 1
  publish(true)
  flush(false)
  armRetry(null)
}

function ensurePlan(floorId: string): Promise<void> {
  if (floorId === 'B1' || plans.has(floorId) || liveDesks(floorId)) return Promise.resolve()
  const pending = planLoads.get(floorId)
  if (pending) return pending
  let file = ''
  try {
    file = floorJsonFile(floorId)
  } catch {
    return Promise.resolve()
  }
  const request = fetch(`/floors/${file}`)
    .then(async (response) => {
      if (!response.ok) return
      const raw: unknown = await response.json()
      const desks = desksFromPlan(raw)
      if (desks.length > 0) plans.set(floorId, desks)
    })
    .catch(() => undefined)
    .then(() => {
      if (enabled && !muted) consider(true)
    })
  planLoads.set(floorId, request)
  return request
}

function prefetch(): void {
  if (!enabled || muted) return
  const source = readSource()
  const floors = new Set<string>()
  for (const alarm of source.alarms) {
    if (alarm.floorId) floors.add(alarm.floorId)
  }
  if (source.focusedDeskId) {
    const focus = anchorForReason('focus', source)
    if (focus) floors.add(focus.floorId)
  }
  for (const floorId of floors) void ensurePlan(floorId)
}

function ensureStyle(): void {
  if (document.querySelector('style[data-alarm-spatial]')) return
  const style = document.createElement('style')
  style.dataset.alarmSpatial = ''
  style.textContent = BUTTON_STYLE
  document.head.append(style)
}

function renderButton(): void {
  const button = ensureButton()
  if (!button) return
  const label = !enabled ? '空间关' : muted ? '已静音' : '空间音'
  const pressed = enabled && muted ? 'true' : 'false'
  const mode = !enabled ? 'off' : muted ? 'muted' : 'on'
  if (button.textContent !== label) button.textContent = label
  if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed)
  if (button.dataset.spatial !== mode) button.dataset.spatial = mode
  const aria = '告警空间音'
  if (button.getAttribute('aria-label') !== aria) button.setAttribute('aria-label', aria)
}

function placeButton(button: HTMLButtonElement, bar: Element): void {
  const speech = bar.querySelector('.alarm-speech-toggle')
  const audio = bar.querySelector('.alarm-audio-mute')
  const after = speech ?? audio
  if (after) {
    if (button.previousSibling !== after) bar.insertBefore(button, after.nextSibling)
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
  const existing = document.querySelector<HTMLButtonElement>('button.alarm-spatial-toggle')
  const bar = document.querySelector('.topbar')
  if (!bar) return existing
  const button = existing ?? document.createElement('button')
  if (!existing) {
    button.type = 'button'
    button.className = 'text-button alarm-spatial-toggle'
    button.addEventListener('click', () => {
      if (!enabled) {
        enabled = true
        muted = false
      } else {
        muted = !muted
      }
      unlockFromGesture()
      renderButton()
      prefetch()
    })
  }
  placeButton(button, bar)
  return button
}

interface NativeAudio {
  state: string
  resume?: () => Promise<void>
}

function sharedContext(): NativeAudio | null {
  try {
    return AudioContext.getContext() as unknown as NativeAudio
  } catch {
    return null
  }
}

function unlockFromGesture(): void {
  const finish = () => {
    unlocked = true
    ensureUrl()
    prefetch()
    consider(true)
  }
  const context = sharedContext()
  if (!context || context.state === 'running' || typeof context.resume !== 'function') {
    finish()
    return
  }
  void context.resume().then(finish, finish)
}

function listenForGesture(): void {
  const onGesture = () => {
    if (!enabled || muted) return
    unlockFromGesture()
  }
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, true)
}

function watchTopbar(): void {
  const observer = new MutationObserver(() => {
    if (!document.querySelector('button.alarm-spatial-toggle')) renderButton()
    wrapMeasureSlot()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/** dock 晚加载之后调用。重复调用不会叠两套监听。 */
export function mountPositionalAudio(): void {
  if (started || typeof window === 'undefined' || typeof document === 'undefined') return
  started = true
  enabled = initialSpatialEnabled()
  muted = initialSpatialMuted()
  memory = createCueMemory()
  plans = new Map()
  bindSpatialClaim(claims)
  publish(false)
  ensureStyle()
  renderButton()
  watchTopbar()
  listenForGesture()
  wrapMeasureSlot()
  window.setInterval(wrapMeasureSlot, 200)
  useTwinStore.subscribe(() => consider())
  prefetch()
  consider(true)
}
