import { useTwinStore } from '../../store/store'
import type { Scene } from 'three'

export type IdleHandle = number

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

  const onInterrupt = () => {
    interrupted = true
  }

  window.addEventListener('pointerdown', onInterrupt, true)
  window.addEventListener('keydown', onInterrupt, true)

  return {
    consumeInterrupt(): boolean {
      const hit = interrupted
      interrupted = false
      return hit
    },
    shouldPause(scene?: Scene): boolean {
      if (interrupted) return true
      const state = useTwinStore.getState()
      if (state.view === 'floor' && state.floorFlyRequest) return true
      const end = window.__twinFlyEnd
      if (end && window.__twinLocate?.deskId !== end.deskId) return true
      if (state.view === 'floor' && state.selectedFloor && scene && !scene.getObjectByName('FloorInterior')) {
        return true
      }
      return false
    },
    dispose() {
      window.removeEventListener('pointerdown', onInterrupt, true)
      window.removeEventListener('keydown', onInterrupt, true)
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
