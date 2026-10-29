import { createElement, Fragment, type ReactNode } from 'react'
import { shaderPreloadDue } from './gate'

/**
 * 生产构建在 dock 哈希定稿后才 import 本文件。
 * dock 自己晚于首帧 2600ms。这里再等同一道窗口，然后把 drei Preload 挂进画布。
 * 开发时 Scene 的首屏 Suspense 直接挂，不会走到这里。
 */

type Slot = ((node: ReactNode) => void) & { __shaderPreload?: boolean }

let booted = false
let live: ReactNode = null
let seen: ReactNode = null
let generation = 0
let loading = false

function paint(target: (node: ReactNode) => void, measure: ReactNode): void {
  if (live == null) {
    target(measure)
    return
  }
  if (measure != null) target(createElement(Fragment, null, measure, live))
  else target(live)
}

function carry(from: object, to: Slot): void {
  for (const key of Object.keys(from)) {
    if (!key.startsWith('__')) continue
    ;(to as unknown as Record<string, unknown>)[key] = (from as Record<string, unknown>)[key]
  }
}

function wrap(): void {
  const current = window.__twinMeasureSlot as Slot | undefined
  if (!current || current.__shaderPreload || live == null) return
  const token = ++generation
  const captured = current
  const wrapped: Slot = (node) => {
    seen = node
    if (token !== generation) {
      captured(node)
      return
    }
    paint(captured, node)
  }
  carry(current, wrapped)
  wrapped.__shaderPreload = true
  window.__twinMeasureSlot = wrapped
  paint(captured, seen)
}

async function arm(): Promise<void> {
  const mod = await import('./PreloadLayer')
  live = createElement(mod.PreloadLayer)
  wrap()
}

export function mountShaderPreload(): void {
  if (booted || typeof window === 'undefined') return
  booted = true
  const tick = () => {
    if (!shaderPreloadDue(window.__twinFirstFrameAt, performance.now())) {
      requestAnimationFrame(tick)
      return
    }
    if (!loading) {
      loading = true
      void arm()
    }
    wrap()
  }
  tick()
  window.setInterval(() => {
    if (shaderPreloadDue(window.__twinFirstFrameAt, performance.now())) wrap()
  }, 200)
}
