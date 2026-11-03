/**
 * T105：楼层 / 视图切换的 DOM 过渡。
 * dock 在首帧之后才 import 本文件。生产构建在哈希定稿前摘掉这段，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx。
 * 没有 document.startViewTransition 时，原来的 view / floor 写入立刻完成。
 */
import { installFloorViewTransition } from './install'
import { ensureFloorViewTransitionStyle } from './run'

export function mountFloorViewTransition(): void {
  installFloorViewTransition()
  if (typeof document === 'undefined') return
  try {
    ensureFloorViewTransitionStyle(document as unknown as Parameters<typeof ensureFloorViewTransitionStyle>[0])
  } catch {
    // 样式挂不上时浏览器仍用默认交叉淡化，切换本身不中断。
  }
}
