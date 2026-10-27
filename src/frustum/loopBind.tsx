import { addAfterEffect } from '@react-three/fiber'

/**
 * 开发时视锥检测直接挂在 fiber 的 addEffect / addAfterEffect 上，循环是真的。
 * 生产构建会把本文件换成入口包上的冲刷器，那两份回调不进 vite 图。
 */
export function useFrustumLoop(): void {}

export function afterRender(callback: () => void): () => void {
  return addAfterEffect(callback)
}
