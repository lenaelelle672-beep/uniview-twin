/**
 * T087：手势里同步调用 documentPictureInPicture.requestWindow。
 * 小窗只挂告警 DOM。失败停在空闲，不向外抛。
 * 退出时关掉小窗，并把焦点交回主页面。
 * 不调用视频值守，也不改帧循环。
 */
import {
  DOCUMENT_WATCH_HEIGHT,
  DOCUMENT_WATCH_WIDTH,
  canvasMoved,
  documentHasPicture,
  mayRequestDocumentWindow,
  restoreCanvas,
  type CanvasSeat,
  type DocumentWatchOpenOptions,
  type DocumentWatchPhase,
} from './policy'
import {
  buildWatchModel,
  watchSignature,
  type WatchActions,
  type WatchDocument,
  type WatchModel,
  type WatchRow,
  type WatchState,
} from './panel'

export interface DocumentWatchWindow {
  document: WatchDocument
  close: () => void
  addEventListener: (type: 'pagehide', listener: () => void) => void
  removeEventListener?: (type: 'pagehide', listener: () => void) => void
}

export interface DocumentWatchPorts {
  disabled: boolean
  supported: boolean
  gesture: boolean
  openerDocument: unknown
  requestWindow: (options: DocumentWatchOpenOptions) => Promise<DocumentWatchWindow | null>
  readState: () => WatchState | null
  subscribe: (listener: () => void) => () => void
  paint: (doc: WatchDocument, model: WatchModel, actions: WatchActions) => void
  focusOpener: () => void
  focusAlarm: (row: WatchRow) => void
  canvasHome?: () => CanvasSeat | null
  onPhase?: (phase: DocumentWatchPhase) => void
  onModel?: (model: WatchModel) => void
}

export interface DocumentWatchController {
  enter: (ports: DocumentWatchPorts) => DocumentWatchPhase
  exit: (ports: DocumentWatchPorts) => void
  phase: () => DocumentWatchPhase
}

function safeHome(ports: DocumentWatchPorts): CanvasSeat | null {
  try {
    return ports.canvasHome?.() ?? null
  } catch {
    return null
  }
}

export function createDocumentWatchController(): DocumentWatchController {
  let phase: DocumentWatchPhase = 'idle'
  let pending = false
  let generation = 0
  let current: DocumentWatchWindow | null = null
  let dropSub: (() => void) | null = null
  let hide: (() => void) | null = null
  let painted = ''
  let busy = false

  function notify(ports: DocumentWatchPorts, next: DocumentWatchPhase): void {
    try {
      ports.onPhase?.(next)
    } catch {
      // 按钮刷不上也不抛。
    }
  }

  function releaseWindow(): void {
    const win = current
    const onHide = hide
    current = null
    hide = null
    try {
      dropSub?.()
    } catch {
      // 退订失败也继续关窗。
    }
    dropSub = null
    painted = ''
    if (!win) return
    if (onHide) {
      try {
        win.removeEventListener?.('pagehide', onHide)
      } catch {
        // 拆监听失败也继续关窗。
      }
    }
    try {
      win.close()
    } catch {
      // 窗已经关了也不抛。
    }
  }

  function finish(ports: DocumentWatchPorts, focus: boolean): void {
    if (busy) return
    busy = true
    generation += 1
    pending = false
    phase = 'idle'
    try {
      releaseWindow()
      if (focus) ports.focusOpener()
      notify(ports, 'idle')
    } catch {
      phase = 'idle'
    } finally {
      busy = false
    }
  }

  function actionsFor(ports: DocumentWatchPorts): WatchActions {
    return {
      onBack: () => {
        if (phase !== 'open') return
        finish(ports, true)
      },
      onFocus: (row) => {
        try {
          ports.focusAlarm(row)
        } catch {
          // 主页面焦点失败时，小窗仍留着。
        }
      },
    }
  }

  function paintNow(ports: DocumentWatchPorts, win: DocumentWatchWindow): void {
    const model = buildWatchModel(safeRead(ports))
    const signature = watchSignature(model)
    if (signature === painted) return
    ports.paint(win.document, model, actionsFor(ports))
    painted = signature
    try {
      ports.onModel?.(model)
    } catch {
      // 外部计数失败不影响小窗。
    }
  }

  function adopt(ports: DocumentWatchPorts, win: DocumentWatchWindow, token: number): void {
    if (token !== generation || phase === 'open' || current) {
      try {
        win.close()
      } catch {
        // 迟到的小窗关不上也不抛。
      }
      return
    }
    const doc = win.document
    if (!doc || (ports.openerDocument != null && doc === ports.openerDocument)) {
      try {
        win.close()
      } catch {
        // 拒绝画进主页面。
      }
      notify(ports, 'idle')
      return
    }
    current = win
    const before = safeHome(ports)
    try {
      paintNow(ports, win)
    } catch {
      finish(ports, true)
      return
    }
    const after = safeHome(ports)
    if (canvasMoved(before, after)) {
      restoreCanvas(before)
      finish(ports, true)
      return
    }
    if (documentHasPicture(doc)) {
      finish(ports, true)
      return
    }
    const onHide = () => {
      if (token !== generation) return
      finish(ports, true)
    }
    hide = onHide
    try {
      win.addEventListener('pagehide', onHide)
    } catch {
      finish(ports, true)
      return
    }
    phase = 'open'
    try {
      dropSub = ports.subscribe(() => {
        if (phase !== 'open' || current !== win || token !== generation) return
        const home = safeHome(ports)
        try {
          paintNow(ports, win)
        } catch {
          return
        }
        const nextHome = safeHome(ports)
        if (canvasMoved(home, nextHome)) restoreCanvas(home)
        if (canvasMoved(home, nextHome) || documentHasPicture(win.document)) finish(ports, true)
      })
    } catch {
      dropSub = null
    }
    notify(ports, 'open')
  }

  return {
    phase: () => phase,
    exit(ports) {
      try {
        if (phase !== 'open' && !pending && !current) {
          generation += 1
          return
        }
        finish(ports, phase === 'open' || current != null)
      } catch {
        phase = 'idle'
        pending = false
        generation += 1
      }
    },
    enter(ports) {
      try {
        const decision = mayRequestDocumentWindow({
          disabled: ports.disabled,
          supported: ports.supported,
          gesture: ports.gesture,
          phase,
          pending,
        })
        if (decision === 'close') {
          finish(ports, true)
          return 'idle'
        }
        if (decision === 'skip') return phase
        if (typeof ports.requestWindow !== 'function') return phase
        const token = generation
        let requested: Promise<DocumentWatchWindow | null>
        try {
          requested = ports.requestWindow({
            width: DOCUMENT_WATCH_WIDTH,
            height: DOCUMENT_WATCH_HEIGHT,
            disallowReturnToOpener: false,
          })
        } catch {
          pending = false
          return 'idle'
        }
        if (!requested || typeof requested.then !== 'function') {
          pending = false
          return 'idle'
        }
        pending = true
        void requested.then(
          (win) => {
            try {
              if (token !== generation) {
                pending = false
                try {
                  win?.close()
                } catch {
                  // 已经取消的小窗关不上也不抛。
                }
                return
              }
              pending = false
              if (!win) {
                notify(ports, 'idle')
                return
              }
              adopt(ports, win, token)
            } catch {
              pending = false
              phase = 'idle'
              try {
                win?.close()
              } catch {
                // 收尾失败也不抛。
              }
              notify(ports, 'idle')
            }
          },
          () => {
            if (token !== generation) return
            pending = false
            phase = 'idle'
            notify(ports, 'idle')
          },
        )
        return phase
      } catch {
        pending = false
        phase = 'idle'
        return 'idle'
      }
    },
  }
}

function safeRead(ports: DocumentWatchPorts): WatchState | null {
  try {
    return ports.readState()
  } catch {
    return null
  }
}
