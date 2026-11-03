/**
 * T105：把会改 `view` 或当前楼层的 store 动作包进 DOM 过渡。
 * 总览里只选中一层、悬停、爆炸、昼夜、画质、机位都不走这里。
 * 那些仍交给原来的写入。镜头阻尼不在这条分包里。
 */
import { useTwinStore } from '../store/store'
import type { CameraId, ViewMode } from '../types'
import { runDomViewTransition, viewTransitionSupported, type DomViewTransitionKind } from './run'

/** 新快照最多再等这么久。浏览器大约 4 秒会放弃这次过渡，这里留出余量。 */
const DOM_SETTLE_CAP_MS = 1500

interface DomQuery {
  querySelector(selector: string): { textContent?: string | null } | null
}

/** 与 data/floors 的 isFloorId 同一条正则。不把楼层表打进这条晚加载分包。 */
const FLOOR_ID = /^(?:B1|F(?:[1-9]|1[0-9]|2[0-2]))$/

const wrapped = new WeakSet<object>()

export interface FloorViewTransitionProbe {
  on: true
  supported: boolean
  transitions: number
  instants: number
  last: DomViewTransitionKind | 'none'
}

interface ProbeHost {
  __twinViewTransition?: FloorViewTransitionProbe
}

export function isFloorToken(value: string): boolean {
  return FLOOR_ID.test(value)
}

function host(): ProbeHost {
  return globalThis as ProbeHost
}

export function floorViewTransitionProbe(): FloorViewTransitionProbe | undefined {
  return host().__twinViewTransition
}

function probe(): FloorViewTransitionProbe {
  const box = host()
  if (!box.__twinViewTransition) {
    box.__twinViewTransition = {
      on: true,
      supported: viewTransitionSupported(),
      transitions: 0,
      instants: 0,
      last: 'none',
    }
  }
  return box.__twinViewTransition
}

function runTracked(update: () => void | Promise<void>): void {
  const kind = runDomViewTransition(update)
  const box = probe()
  box.supported = viewTransitionSupported()
  box.last = kind
  if (kind === 'transition') box.transitions += 1
  else box.instants += 1
}

/**
 * 新界面进 DOM 之后再让浏览器拍快照。
 * 蓝图是切过去之后才挂上的。不等的话，新旧快照都还是原来的画布，交叉淡化会被跳过。
 * 等待用 MutationObserver。动画帧在回调的 Promise 结束前不会跑，不能拿它来等。
 */
function chipShowsFloor(text: string | null | undefined, floor: string): boolean {
  if (!text) return false
  return new RegExp(`(?:^|[^A-Z0-9])${floor}(?:[^0-9]|$)`).test(text)
}

export function floorViewDomReady(view: ViewMode, floor: string | null, doc: DomQuery): boolean {
  if (view === 'blueprint') return doc.querySelector('.blueprint') != null
  if (view === 'floor') {
    if (doc.querySelector('button.back-button') == null) return false
    if (!floor) return true
    return chipShowsFloor(doc.querySelector('.view-chip')?.textContent, floor)
  }
  return doc.querySelector('button.explode-button') != null && doc.querySelector('button.back-button') == null
}

function settleFloorViewDom(): Promise<void> | void {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return
  const { view, selectedFloor } = useTwinStore.getState()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      observer.disconnect()
      clearTimeout(cap)
      resolve()
    }
    const ready = () => floorViewDomReady(view, selectedFloor, document)
    const observer = new MutationObserver(() => {
      if (ready()) finish()
    })
    const root = document.body ?? document.documentElement
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true })
    const cap = setTimeout(finish, DOM_SETTLE_CAP_MS)
    queueMicrotask(() => {
      if (ready()) finish()
    })
  })
}

interface ViewpointPatch {
  token: string
  view: ViewMode
  floor: string | null
  cam: CameraId | null
  pos?: string | null
}

interface FocusPatch {
  floor: string
  deskId: string | null
  deviceId?: string | null
}

/** dock 晚加载之后调用。重复调用不会套两层。 */
export function installFloorViewTransition(): void {
  const current = useTwinStore.getState().setView
  if (wrapped.has(current)) {
    probe().supported = viewTransitionSupported()
    return
  }

  const orig = useTwinStore.getState()

  const setView = (view: ViewMode) => {
    if (useTwinStore.getState().view === view) {
      orig.setView(view)
      return
    }
    runTracked(() => {
      orig.setView(view)
      return settleFloorViewDom()
    })
  }

  const enterFloor = (floorId: string) => {
    const state = useTwinStore.getState()
    const changes = isFloorToken(floorId) && !(state.view === 'floor' && state.selectedFloor === floorId)
    if (!changes) {
      orig.enterFloor(floorId)
      return
    }
    runTracked(() => {
      orig.enterFloor(floorId)
      return settleFloorViewDom()
    })
  }

  const exitFloor = () => {
    if (useTwinStore.getState().view !== 'floor') {
      orig.exitFloor()
      return
    }
    runTracked(() => {
      orig.exitFloor()
      return settleFloorViewDom()
    })
  }

  const setSelectedFloor = (floorId: string | null) => {
    const state = useTwinStore.getState()
    const changes = state.view === 'floor' && state.selectedFloor !== floorId
    if (!changes) {
      orig.setSelectedFloor(floorId)
      return
    }
    runTracked(() => {
      orig.setSelectedFloor(floorId)
      return settleFloorViewDom()
    })
  }

  const focusDevice = (target: FocusPatch) => {
    const state = useTwinStore.getState()
    const changes = state.view !== 'floor' || state.selectedFloor !== target.floor
    if (!changes) {
      orig.focusDevice(target)
      return
    }
    runTracked(() => {
      orig.focusDevice(target)
      return settleFloorViewDom()
    })
  }

  const showViewpoint = (next: ViewpointPatch) => {
    const state = useTwinStore.getState()
    const changes = state.view !== next.view || state.selectedFloor !== next.floor
    if (!changes) {
      orig.showViewpoint(next)
      return
    }
    runTracked(() => {
      orig.showViewpoint(next)
      return settleFloorViewDom()
    })
  }

  wrapped.add(setView)
  useTwinStore.setState({ setView, enterFloor, exitFloor, setSelectedFloor, focusDevice, showViewpoint })
  const box = probe()
  box.on = true
  box.supported = viewTransitionSupported()
}
