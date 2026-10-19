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

type AssetProgress = { active: boolean; progress: number }

let assetProgress: AssetProgress = { active: false, progress: 0 }
const progressListeners = new Set<() => void>()

export function assetProgressSnapshot(): AssetProgress {
  return assetProgress
}

export function subscribeAssetProgress(listener: () => void): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

/** 由首帧后再加载的 useProgress 桥写入。主包不引用 drei Progress。 */
export function publishAssetProgress(active: boolean, progress: number): void {
  if (assetProgress.active === active && assetProgress.progress === progress) return
  assetProgress = { active, progress }
  for (const listener of progressListeners) listener()
}

export function resetAssetProgress(): void {
  assetProgress = { active: false, progress: 0 }
  for (const listener of progressListeners) listener()
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
