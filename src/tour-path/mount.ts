import { isAlarmTourLabel, tourPathGateOn } from './gate'

/**
 * T071：开发时 dock 在首帧之后 import 本文件。
 * 这里不静态引用播放实现。点击导览且门开着才动态 import。
 * 生产构建会把 dock 里的这段摘掉，改由哈希之后的引导在同一条件下 import 播放分包。
 */

let installed = false
let playing = false
let cancel: (() => void) | null = null
let token = 0

function markIdle(): void {
  token += 1
  playing = false
  cancel = null
}

function tourButton(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof Element)) return null
  const button = target.closest('button')
  if (!(button instanceof HTMLButtonElement)) return null
  if (!button.closest('[data-viewmark-root]')) return null
  if (!isAlarmTourLabel(button.textContent)) return null
  return button
}

function stopPlaying(): void {
  const current = cancel
  playing = false
  cancel = null
  token += 1
  current?.()
}

function onClick(event: MouseEvent): void {
  if (!tourPathGateOn()) return
  const button = tourButton(event.target)
  if (!button || button.disabled) return
  event.preventDefault()
  event.stopPropagation()
  if (playing) {
    stopPlaying()
    return
  }
  playing = true
  const mine = ++token
  void import('./session')
    .then((mod) => {
      if (mine !== token || !playing) return
      const session = mod.startMotionPathTour()
      if (mine !== token || !playing) {
        session.cancel()
        return
      }
      cancel = () => {
        playing = false
        cancel = null
        session.cancel()
      }
    })
    .catch(() => {
      if (mine === token) {
        playing = false
        cancel = null
      }
    })
}

function onKey(event: KeyboardEvent): void {
  if (!playing || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  stopPlaying()
}

/** 重复调用无事。观众地址上监听还在，但门关着时直接返回，不会 import 播放包。 */
export function mountMotionPath(): void {
  if (typeof document === 'undefined') return
  if (installed) return
  installed = true
  window.__twinMotionPathIdle = markIdle
  document.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKey, true)
}
