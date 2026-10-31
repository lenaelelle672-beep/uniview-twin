import { installBadgePoseHooks } from '../scene/badgeExplodePose'
import { createStationDrive, driveStation, type StationNode } from './drive'

/**
 * T091：工位级爆炸。
 * dock 在首帧之后才 import 本文件。生产构建在 dock 哈希定稿前摘掉接线，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 楼层外壳仍由 ExplodedLayout 改 position.y。这里只写已有实例的 setMatrixAt。
 */

let started = false
let wake = 0
let paintSoon = 0
let wanted = false
let seenView = ''
let framing = 0
let button: HTMLButtonElement | null = null
const drive = createStationDrive()

/**
 * `__twinView` 写成 building / blueprint 时立刻卸工位按钮。
 * 昼景停稳后 demand 不再交帧，卸按钮若只放在 onFrame，宽屏昼景离开单层后按钮会留在总览。
 * 值短暂缺失时不调用 onLeave，仍沿用上一帧 seenView，不把跟随闩清掉。
 */
export function bindStationView(
  host: { __twinView?: string },
  onLeave: (view: 'building' | 'blueprint') => void,
): void {
  const desc = Object.getOwnPropertyDescriptor(host, '__twinView')
  if (desc?.set) return
  let current = host.__twinView
  Object.defineProperty(host, '__twinView', {
    configurable: true,
    enumerable: true,
    get() {
      return current
    },
    set(next: string | undefined) {
      current = next
      if (next === 'building' || next === 'blueprint') onLeave(next)
    },
  })
}

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
  const pressed = wanted ? 'true' : 'false'
  if (button.textContent === label && button.getAttribute('aria-pressed') === pressed) return
  button.className = wanted ? 'explode-button is-active' : 'explode-button'
  button.setAttribute('aria-pressed', pressed)
  button.setAttribute('aria-label', label)
  button.textContent = label
}

/** 别在 R3F 这一帧里改按钮。视锥槽正在 flush 时同步改 DOM 会互相重入直到爆栈。 */
function schedulePaint(): void {
  if (paintSoon) return
  paintSoon = requestAnimationFrame(() => {
    paintSoon = 0
    paintButton()
  })
}

function syncWanted(view: string): void {
  if (view !== 'floor') {
    wanted = false
    return
  }
  if (window.__twinExplodeFollow !== true) return
  const aim = window.__ea
  if (typeof aim === 'number') wanted = aim > 0
}

function dropStationButtons(): void {
  if (button) {
    button.hidden = true
    button.remove()
    button = null
  }
  if (typeof document === 'undefined') return
  const nodes = document.querySelectorAll('button.explode-button')
  for (const node of nodes) {
    const label = `${node.getAttribute('aria-label') ?? ''} ${node.textContent ?? ''}`
    if (!label.includes('工位')) continue
    node.remove()
  }
}

/** 已经确认不在单层。取消还没落地的文案刷新，避免 rAF 把「收拢工位」写回去。 */
function releaseFloorControl(next: 'building' | 'blueprint'): void {
  seenView = next
  wanted = false
  if (window.__twinExplodeFollow) window.__twinExplodeFollow = false
  if (paintSoon) {
    cancelAnimationFrame(paintSoon)
    paintSoon = 0
  }
  dropStationButtons()
}

function noteLeave(view: 'building' | 'blueprint'): void {
  if (framing) {
    queueMicrotask(() => {
      const live = window.__twinView
      if (live === 'building' || live === 'blueprint') releaseFloorControl(live)
    })
    return
  }
  releaseFloorControl(view)
}

function installLeaveHook(): void {
  bindStationView(window, noteLeave)
}

function recheckLeave(): void {
  installLeaveHook()
  const live = window.__twinView
  if (live === 'building' || live === 'blueprint') noteLeave(live)
}

function armLeaveRecheck(): void {
  const schedule = () => {
    queueMicrotask(recheckLeave)
  }
  window.addEventListener('click', schedule, true)
  window.addEventListener('keydown', schedule, true)
}

function ensureButton(view: string): void {
  if (view !== 'floor') {
    releaseFloorControl(view === 'blueprint' ? 'blueprint' : 'building')
    return
  }
  const stage = document.querySelector('main.stage')
  if (!stage) return
  if (!button || button.parentElement !== stage) {
    button?.remove()
    const next = document.createElement('button')
    next.type = 'button'
    next.addEventListener('click', () => {
      const open = window.__twinExplodeFollow === true && (window.__ea ?? 0) > 0
      wanted = !open
      window.__twinExplodeFollow = true
      window.__es = false
      const nextProgress = wanted ? 1 : 0
      const setProgress = window.__twinSetExplodeProgress
      if (setProgress) setProgress(nextProgress)
      else window.__ea = nextProgress
      paintButton()
      const root = frameRoot()
      if (!root) return
      root.state.invalidate()
      askFrame(root.state.invalidate)
    })
    stage.appendChild(next)
    button = next
    paintButton()
  } else {
    schedulePaint()
  }
}

function onFrame(state: FrameState): void {
  framing += 1
  try {
    installLeaveHook()
    const live = window.__twinView
    if (live === 'floor' || live === 'building' || live === 'blueprint') seenView = live
    const view = seenView || live || 'building'
    syncWanted(view)
    ensureButton(view)
    const scene = window.__twinScene as StationNode | undefined
    const stats = driveStation(drive, scene, wanted, view, state.clock.elapsedTime)
    window.__twinStationExplode = stats
    // 停稳这一帧的渲染还没开始，静止矩阵已经写进实例。尾帧会落进 1024 的 1.8 秒窗。
    if (stats.animating) askFrame(state.invalidate)
  } finally {
    framing -= 1
  }
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
  installBadgePoseHooks()
  installLeaveHook()
  armLeaveRecheck()
  recheckLeave()
  attach()
}
