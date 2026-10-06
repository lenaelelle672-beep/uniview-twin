import { useTwinStore } from '../../store/store'
import type { Scene } from 'three'

export type IdleHandle = number

/** 用户输入后至少空闲这么久才继续预热。 */
export const PREWARM_RESUME_IDLE_MS = 1000

/** 飞行 / 定位 / FloorInterior 未挂上时，按这个间隔让出宏任务，禁止 0ms 空转。 */
export const PREWARM_SCENE_PAUSE_POLL_MS = 100

export type PrewarmPauseReason = 'input' | 'scene'

export function scheduleIdle(callback: () => void, timeout = 800): IdleHandle {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback(callback, { timeout })
  }
  return window.setTimeout(callback, 32)
}

export function cancelIdle(handle: IdleHandle): void {
  if (typeof cancelIdleCallback === 'function') {
    cancelIdleCallback(handle)
    return
  }
  window.clearTimeout(handle)
}

export function waitIdle(timeout = 800): Promise<void> {
  return new Promise((resolve) => {
    scheduleIdle(() => resolve(), timeout)
  })
}

export function createYieldController() {
  let interrupted = false
  let lastInputAt = 0
  let lastFloorToken = `${useTwinStore.getState().view}:${useTwinStore.getState().selectedFloor ?? ''}`

  const onInterrupt = () => {
    interrupted = true
    lastInputAt = performance.now()
  }

  const capture: AddEventListenerOptions = { capture: true }
  const passive: AddEventListenerOptions = { capture: true, passive: true }
  window.addEventListener('pointerdown', onInterrupt, capture)
  window.addEventListener('keydown', onInterrupt, capture)
  window.addEventListener('wheel', onInterrupt, passive)

  const unsubFloor = useTwinStore.subscribe((state) => {
    const token = `${state.view}:${state.selectedFloor ?? ''}`
    if (token === lastFloorToken) return
    lastFloorToken = token
    onInterrupt()
  })

  function pauseReason(scene?: Scene): PrewarmPauseReason | null {
    if (interrupted) return 'input'
    if (lastInputAt > 0 && performance.now() - lastInputAt < PREWARM_RESUME_IDLE_MS) return 'input'
    const state = useTwinStore.getState()
    if (state.view === 'floor' && state.floorFlyRequest) return 'scene'
    const end = window.__twinFlyEnd
    if (end && window.__twinLocate?.deskId !== end.deskId) return 'scene'
    if (state.view === 'floor' && state.selectedFloor && scene && !scene.getObjectByName('FloorInterior')) {
      return 'scene'
    }
    return null
  }

  return {
    consumeInterrupt(): boolean {
      const hit = interrupted
      interrupted = false
      return hit
    },
    pauseReason,
    shouldPause(scene?: Scene): boolean {
      return pauseReason(scene) != null
    },
    waitQuiet(ms = PREWARM_RESUME_IDLE_MS): Promise<void> {
      return new Promise((resolve) => {
        const tick = () => {
          if (performance.now() - lastInputAt >= ms) {
            resolve()
            return
          }
          window.setTimeout(tick, 50)
        }
        // 第一次检查也走宏任务，避免 Promise 构造里同步 resolve 只让出微任务。
        window.setTimeout(tick, 0)
      })
    },
    waitScenePause(ms = PREWARM_SCENE_PAUSE_POLL_MS): Promise<void> {
      const delay = Math.max(PREWARM_SCENE_PAUSE_POLL_MS, ms)
      return new Promise((resolve) => {
        window.setTimeout(resolve, delay)
      })
    },
    dispose() {
      window.removeEventListener('pointerdown', onInterrupt, capture)
      window.removeEventListener('keydown', onInterrupt, capture)
      window.removeEventListener('wheel', onInterrupt, passive)
      unsubFloor()
    },
  }
}

export type YieldController = ReturnType<typeof createYieldController>

async function yieldAfterPause(yieldCtl: YieldController, scene?: Scene): Promise<void> {
  if (yieldCtl.pauseReason(scene) === 'scene') {
    await yieldCtl.waitScenePause()
    return
  }
  await yieldCtl.waitQuiet()
}

/** IdlePrewarm.waitTurn：暂停时必须让出宏任务，scene 暂停至少隔 100ms。 */
export async function waitPrewarmTurn(
  yieldCtl: YieldController,
  scene: Scene | undefined,
  cancelled: () => boolean,
): Promise<number> {
  let yielded = 0
  while (!cancelled()) {
    if (yieldCtl.consumeInterrupt() || yieldCtl.shouldPause(scene)) {
      yielded += 1
      await yieldAfterPause(yieldCtl, scene)
      continue
    }
    await waitIdle()
    if (cancelled()) return yielded
    if (yieldCtl.consumeInterrupt() || yieldCtl.shouldPause(scene)) {
      yielded += 1
      await yieldAfterPause(yieldCtl, scene)
      continue
    }
    return yielded
  }
  return yielded
}

export async function waitUntil(ok: () => boolean, timeoutMs = 60_000): Promise<boolean> {
  const deadline = performance.now() + timeoutMs
  while (!ok()) {
    if (performance.now() >= deadline) return false
    await waitIdle(250)
  }
  return true
}
