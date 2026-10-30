import { useTwinStore } from '../store/store'
import { installExplodeProgress } from './publish'
import { explodeEscapeAction, explodeKeyAction, explodeProgressKeyBlocked, stepExplodeStop, toggleExplodeProgress } from './steps'

/**
 * T094：Stage 旁的原生 range，加 E / [ / ]。
 * 跟 dock 一起在首帧之后才挂，不进 hardGate / balancedFx。
 * 按键用 window keydown。滑杆是 DOM range，不放进三维标注。
 * 楼层和工位仍各走自己的时钟；这里只写同一份 explodeProgress。
 */

let started = false
let wake = 0
let spareEscape = false
let host: HTMLLabelElement | null = null
let nameEl: HTMLSpanElement | null = null
let input: HTMLInputElement | null = null
let pctEl: HTMLSpanElement | null = null

interface FrameState {
  invalidate: () => void
}

function frameRoot(): { state: FrameState } | null {
  const scene = window.__twinScene as { __r3f?: { root?: { getState: () => FrameState } } } | undefined
  const state = scene?.__r3f?.root?.getState()
  if (!state || typeof state.invalidate !== 'function') return null
  return { state }
}

function askFrame(invalidate: () => void): void {
  if (wake) return
  wake = requestAnimationFrame(() => {
    wake = 0
    invalidate()
  })
}

/** demand 下要先 invalidate，ExplodedLayout / 工位分包里的 askFrame 才会把 0.8 秒续完。 */
function kick(): void {
  const root = frameRoot()
  if (!root) return
  root.state.invalidate()
  askFrame(root.state.invalidate)
}

function shownProgress(view: string): number {
  if (view === 'floor' && window.__twinExplodeFollow !== true) return 0
  const value = useTwinStore.getState().explodeProgress
  return typeof value === 'number' ? value : 0
}

function armSpareEscape(): void {
  if (useTwinStore.getState().view === 'floor') spareEscape = true
}

function escapeBusy(): boolean {
  if (window.__twinMeasureOn) return true
  const mode = window.__twinFocusFit?.mode
  if (mode && mode !== 'off') return true
  return document.fullscreenElement != null
}

function apply(view: string, progress: number, scrub: boolean): void {
  window.__twinExplodeFollow = view === 'floor'
  if (view === 'floor') spareEscape = true
  window.__es = scrub
  useTwinStore.getState().setExplodeProgress(progress)
  kick()
}

function paint(): void {
  const parent = document.querySelector('main.stage')
  if (!parent) return
  if (!host || !input || !nameEl || !pctEl) return
  if (host.parentElement !== parent) parent.appendChild(host)
  const view = useTwinStore.getState().view
  const open = view === 'building' || view === 'floor'
  host.hidden = !open
  if (!open) return
  const progress = shownProgress(view)
  nameEl.textContent = view === 'floor' ? '工位' : '楼层'
  pctEl.textContent = `${Math.round(progress * 100)}%`
  if (Math.abs(Number(input.value) - progress) > 0.0005) input.value = String(progress)
  input.setAttribute('aria-valuetext', `${nameEl.textContent} ${pctEl.textContent}`)
}

function ensureHost(): void {
  if (host) return
  const parent = document.querySelector('main.stage')
  if (!parent) {
    window.setTimeout(ensureHost, 240)
    return
  }
  const label = document.createElement('label')
  label.dataset.explodeProgressHost = '1'
  label.style.cssText = [
    'position:absolute',
    'z-index:3',
    'top:12px',
    'right:128px',
    'display:flex',
    'align-items:center',
    'gap:6px',
    'height:32px',
    'margin:0',
    'padding:0 8px',
    'border-radius:8px',
    'background:rgba(12,35,64,.86)',
    'color:#fff',
    'font-size:12px',
    'line-height:1',
  ].join(';')
  const name = document.createElement('span')
  const range = document.createElement('input')
  range.type = 'range'
  range.min = '0'
  range.max = '1'
  range.step = '0.01'
  range.dataset.explodeProgress = '1'
  range.setAttribute('aria-label', '爆炸进度')
  range.style.cssText = 'width:108px;margin:0;accent-color:#c2410c'
  range.addEventListener('input', () => {
    const view = useTwinStore.getState().view
    if (view !== 'building' && view !== 'floor') return
    apply(view, Number(range.value), true)
  })
  const pct = document.createElement('span')
  pct.style.minWidth = '32px'
  label.append(name, range, pct)
  parent.appendChild(label)
  host = label
  nameEl = name
  input = range
  pctEl = pct
  paint()
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    const action = explodeEscapeAction(event, {
      view: useTwinStore.getState().view,
      sliderFocused: input != null && document.activeElement === input,
      spare: spareEscape,
      busy: escapeBusy(),
    })
    if (action === 'pass') return
    event.preventDefault()
    event.stopPropagation()
    if (action === 'blur' && input) input.blur()
    spareEscape = false
    return
  }
  if (explodeProgressKeyBlocked(event)) return
  const action = explodeKeyAction(event)
  if (!action) return
  const view = useTwinStore.getState().view
  if (view !== 'building' && view !== 'floor') return
  const current = shownProgress(view)
  const next = action === 'toggle' ? toggleExplodeProgress(current) : stepExplodeStop(current, action === 'up' ? 1 : -1)
  event.preventDefault()
  event.stopPropagation()
  armSpareEscape()
  apply(view, next, false)
}

export function mountExplodeProgress(): void {
  if (started || typeof window === 'undefined') return
  started = true
  installExplodeProgress()
  window.__twinSetExplodeProgress = (value) => {
    const view = useTwinStore.getState().view
    window.__es = false
    if (view === 'floor') {
      window.__twinExplodeFollow = true
      spareEscape = true
    }
    useTwinStore.getState().setExplodeProgress(value)
    kick()
  }
  ensureHost()
  window.addEventListener('keydown', onKey, true)
  useTwinStore.subscribe((state, prev) => {
    if (state.view !== 'floor') spareEscape = false
    if (state.view === prev.view && state.explodeProgress === prev.explodeProgress && state.exploded === prev.exploded) return
    paint()
  })
  paint()
}
