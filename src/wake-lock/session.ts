/**
 * T085：Screen Wake Lock 会话。
 * 只在文档可见时 `request('screen')`。隐藏时释放，回到可见再申请。
 * 失败留在降级态，不向外抛。不读 document / navigator，避免挂进主路径。
 */

export type WakePhase = 'off' | 'held' | 'armed' | 'degraded'

export interface WakeSentinel {
  released: boolean
  release: () => Promise<void> | void
  addEventListener: (type: 'release', listener: () => void) => void
}

export interface WakePorts {
  /** 文档当前可见。hidden 时禁止 request。 */
  visible: boolean
  /** 安全上下文且存在 wakeLock.request。 */
  supported: boolean
  request: (type: 'screen') => Promise<WakeSentinel>
}

export interface WakeView {
  enabled: boolean
  phase: WakePhase
  held: boolean
}

export interface WakeController {
  enable: (ports: WakePorts) => WakeView
  disable: (ports: WakePorts) => WakeView
  /** visibilitychange。hidden 不申请；回到 visible 且仍开着才重申请。 */
  onVisibility: (ports: WakePorts) => WakeView
  view: () => WakeView
}

function isThenable(value: unknown): value is Promise<WakeSentinel> {
  return (
    typeof value === 'object' &&
    value != null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

export function createWakeLockController(onView?: (view: WakeView) => void): WakeController {
  let enabled = false
  let visible = false
  let phase: WakePhase = 'off'
  let sentinel: WakeSentinel | null = null
  let generation = 0
  let inflight = false

  const snapshot = (): WakeView => ({
    enabled,
    phase,
    held: phase === 'held' && sentinel != null && sentinel.released !== true,
  })

  const emit = () => {
    try {
      onView?.(snapshot())
    } catch {
      // 按钮刷新失败也不抛。
    }
  }

  const safeRelease = (current: WakeSentinel | null) => {
    if (!current || current.released) return
    try {
      const result = current.release()
      if (isThenable(result)) {
        void result.then(
          () => {},
          () => {},
        )
      }
    } catch {
      // 释放失败也不抛。
    }
  }

  const finishStale = (next: WakeSentinel, token: number) => {
    safeRelease(next)
    if (generation !== token) return
    if (!enabled) phase = 'off'
    else if (!visible) phase = 'armed'
    else phase = 'degraded'
    emit()
  }

  const bind = (next: WakeSentinel, token: number) => {
    if (generation !== token || !enabled || !visible || next.released === true) {
      finishStale(next, token)
      return
    }
    sentinel = next
    phase = 'held'
    try {
      next.addEventListener('release', () => {
        if (sentinel !== next) return
        sentinel = null
        if (!enabled) phase = 'off'
        else if (!visible) phase = 'armed'
        else phase = 'degraded'
        emit()
      })
    } catch {
      // 听不到释放事件也先记成持有。隐藏后的重申请仍走 visibilitychange。
    }
    emit()
  }

  const tryAcquire = (ports: WakePorts): WakeView => {
    visible = ports.visible
    if (!enabled) {
      phase = 'off'
      emit()
      return snapshot()
    }
    if (!ports.visible) {
      // 没有可见文档就不许留着锁。在途申请作废，回来时会 release。
      generation += 1
      inflight = false
      phase = 'armed'
      dropHeld()
      emit()
      return snapshot()
    }
    if (!ports.supported) {
      phase = 'degraded'
      emit()
      return snapshot()
    }
    if (sentinel && sentinel.released !== true) {
      phase = 'held'
      emit()
      return snapshot()
    }
    if (inflight) {
      phase = 'armed'
      emit()
      return snapshot()
    }

    const token = ++generation
    inflight = true
    let pending: Promise<WakeSentinel>
    try {
      pending = ports.request('screen')
    } catch {
      inflight = false
      phase = 'degraded'
      emit()
      return snapshot()
    }
    if (!isThenable(pending)) {
      inflight = false
      phase = 'degraded'
      emit()
      return snapshot()
    }
    phase = 'armed'
    try {
      void pending.then(
        (next) => {
          if (generation === token) inflight = false
          if (!next || typeof next.release !== 'function') {
            if (generation !== token || !enabled) return
            phase = visible ? 'degraded' : 'armed'
            emit()
            return
          }
          bind(next, token)
        },
        () => {
          if (generation === token) inflight = false
          if (generation !== token || !enabled) return
          phase = visible ? 'degraded' : 'armed'
          emit()
        },
      )
    } catch {
      inflight = false
      phase = 'degraded'
    }
    emit()
    return snapshot()
  }

  const dropHeld = () => {
    const current = sentinel
    sentinel = null
    safeRelease(current)
  }

  return {
    view: snapshot,
    enable(ports) {
      try {
        enabled = true
        return tryAcquire(ports)
      } catch {
        phase = 'degraded'
        emit()
        return snapshot()
      }
    },
    disable(ports) {
      try {
        visible = ports.visible
        enabled = false
        generation += 1
        inflight = false
        phase = 'off'
        dropHeld()
        emit()
        return snapshot()
      } catch {
        enabled = false
        sentinel = null
        phase = 'off'
        emit()
        return snapshot()
      }
    },
    onVisibility(ports) {
      try {
        visible = ports.visible
        if (!enabled) {
          emit()
          return snapshot()
        }
        if (!ports.visible) {
          generation += 1
          inflight = false
          phase = 'armed'
          dropHeld()
          emit()
          return snapshot()
        }
        return tryAcquire(ports)
      } catch {
        phase = enabled ? (ports.visible ? 'degraded' : 'armed') : 'off'
        emit()
        return snapshot()
      }
    },
  }
}
