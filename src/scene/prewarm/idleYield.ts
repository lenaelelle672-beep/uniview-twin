import { useTwinStore } from '../../store/store'
import type { Scene } from 'three'

export type IdleHandle = number

/** 用户输入后至少空闲这么久才继续预热。 */
export const PREWARM_RESUME_IDLE_MS = 1000

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

  return {
    consumeInterrupt(): boolean {
      const hit = interrupted
      interrupted = false
      return hit
    },
    shouldPause(scene?: Scene): boolean {
      if (interrupted) return true
      if (lastInputAt > 0 && performance.now() - lastInputAt < PREWARM_RESUME_IDLE_MS) return true
      const state = useTwinStore.getState()
      if (state.view === 'floor' && state.floorFlyRequest) return true
      const end = window.__twinFlyEnd
      if (end && window.__twinLocate?.deskId !== end.deskId) return true
      if (state.view === 'floor' && state.selectedFloor && scene && !scene.getObjectByName('FloorInterior')) {
        return true
      }
      return false
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
        tick()
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

export async function waitUntil(ok: () => boolean, timeoutMs = 60_000): Promise<boolean> {
  const deadline = performance.now() + timeoutMs
  while (!ok()) {
    if (performance.now() >= deadline) return false
    await waitIdle(250)
  }
  return true
}
