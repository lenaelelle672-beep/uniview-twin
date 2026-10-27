import { createElement, Fragment, type ReactNode } from 'react'
import { composeCursorNode, createCursorBridge, type CursorSlot } from './bridge'
import { HoverCursor } from './HoverCursor'

/**
 * T075：dock 在首帧 2600ms 之后才 import 本文件。
 * 生产构建在 dock 哈希定稿前摘掉这段，定稿后再把独立分包接回去。
 * 不进首屏体积门禁。悬停组件不占几何，也不按帧续画。
 */

let started = false
let bridge: ReturnType<typeof createCursorBridge> | null = null

function cursorNode(): ReactNode {
  return createElement(HoverCursor)
}

export function mountHoverCursor(): void {
  if (typeof document === 'undefined') return
  if (started) return
  started = true
  const cursor = cursorNode()
  bridge = createCursorBridge({
    read: () => window.__twinMeasureSlot as CursorSlot | undefined,
    write: (slot) => {
      window.__twinMeasureSlot = slot as Window['__twinMeasureSlot']
    },
    compose: (node) =>
      composeCursorNode(node, cursor, (nodes) => createElement(Fragment, null, ...(nodes as ReactNode[]))),
    measureOn: () => window.__twinMeasureOn === true,
  })
  const startedAt = performance.now()
  const tick = () => {
    bridge?.tick()
    if (bridge?.installed) return
    if (performance.now() - startedAt > 20_000) return
    window.setTimeout(tick, 50)
  }
  tick()
}

export function resetHoverCursorMountForTests(): void {
  started = false
  bridge = null
}
