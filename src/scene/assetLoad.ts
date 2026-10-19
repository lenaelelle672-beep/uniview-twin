import { useLayoutEffect } from 'react'

/**
 * 空白 Suspense 的计数。fallback 挂上就 +1，卸下就 -1。
 * 不写 __twinReady，不挡 QA harness。
 */
let blanks = 0
const listeners = new Set<() => void>()

function emitBlank() {
  for (const listener of listeners) listener()
}

export function blankSuspenseCount(): number {
  return blanks
}

export function subscribeBlankSuspense(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function retainBlankSuspense(): () => void {
  blanks += 1
  emitBlank()
  return () => {
    blanks = Math.max(0, blanks - 1)
    emitBlank()
  }
}

export function resetBlankSuspense(): void {
  blanks = 0
  emitBlank()
}

/** 首屏或进层的空白 Suspense。返回 null，不往 three 场景里塞网格。 */
export function BlankSuspenseFallback() {
  useLayoutEffect(() => retainBlankSuspense(), [])
  return null
}

/**
 * 加载条可见条件。
 * 背景预取在就绪之后仍会打 DefaultLoadingManager，那种不能再盖住画面。
 * 进层 Suspense 重新变空白时，即使已经 ready 也要再出现。
 */
export function assetOverlayVisible(input: { blanks: number; loading: boolean; ready: boolean }): boolean {
  if (input.blanks > 0) return true
  return input.loading && !input.ready
}
