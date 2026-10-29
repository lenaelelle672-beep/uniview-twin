import { createStationDrive, driveStation, type StationNode } from './drive'

/**
 * T091：工位级爆炸。
 * dock 在首帧之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉接线，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 楼层外壳仍由 ExplodedLayout 改 position.y。这里只写已有实例的 setMatrixAt。
 */

let started = false
let wake = 0
let wasAnimating = false
let wanted = false
let button: HTMLButtonElement | null = null
const drive = createStationDrive()

interface FrameState {
  clock: { elapsedTime: number }
  invalidate: () => void
  internal?: {
    subscribe?: (
      ref: { current: (state: FrameState, delta: number) => void },
      priority?: number,
      store?: FrameStore,
    ) => () => void
  }
}

interface FrameStore {
  getState: () => FrameState
}

function frameRoot(): { state: FrameState; store: FrameStore } | null {
  const scene = window.__twinScene as { __r3f?: { root?: FrameStore } } | undefined
  const store = scene?.__r3f?.root
  if (!store) return null
  const state = store.getState()
  if (!state?.clock || typeof state.invalidate !== 'function' || typeof state.internal?.subscribe !== 'function') return null
  return { state, store }
}

function askFrame(invalidate: () => void): void {
  if (wake) return
  wake = requestAnimationFrame(() => {
    wake = 0
    invalidate()
  })
}

function paintButton(): void {
  if (!button) return
  const label = wanted ? '收拢工位' : '工位爆炸'
  button.className = wanted ? 'explode-button is-active' : 'explode-button'
  button.setAttribute('aria-pressed', wanted ? 'true' : 'false')
  button.setAttribute('aria-label', label)
  button.textContent = label
}

function ensureButton(view: string): void {
  if (view !== 'floor') {
    if (wanted) wanted = false
    button?.remove()
    button = null
    return
  }
  const stage = document.querySelector('main.stage')
  if (!stage) return
  if (!button || button.parentElement !== stage) {
    button?.remove()
    const next = document.createElement('button')
    next.type = 'button'
    next.addEventListener('click', () => {
      wanted = !wanted
      paintButton()
      const root = frameRoot()
      if (!root) return
      root.state.invalidate()
      askFrame(root.state.invalidate)
    })
    stage.appendChild(next)
    button = next
  }
  paintButton()
}

function onFrame(state: FrameState): void {
  const view = window.__twinView ?? 'building'
  ensureButton(view)
  const scene = window.__twinScene as StationNode | undefined
  const stats = driveStation(drive, scene, wanted, view, state.clock.elapsedTime)
  window.__twinStationExplode = stats
  if (stats.animating) askFrame(state.invalidate)
  else if (wasAnimating) askFrame(state.invalidate)
  wasAnimating = stats.animating
}

function attach(): void {
  const root = frameRoot()
  if (!root) {
    window.setTimeout(attach, 240)
    return
  }
  // priority 0。正优先级会关掉 R3F 自己的渲染。第三个参数必须是 store，否则 useFrame 回调里 store 为空。
  const ref = { current: onFrame }
  root.state.internal?.subscribe?.(ref, 0, root.store)
  root.state.invalidate()
}

export function mountStationExplode(): void {
  if (started) return
  started = true
  attach()
}
