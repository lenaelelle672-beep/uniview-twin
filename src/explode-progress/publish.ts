import { useTwinStore } from '../store/store'
import { clampExplodeProgress } from './steps'

/**
 * 进度不进首屏切片。dock 之后才把 explodeProgress / setExplodeProgress 装上，
 * 并包一层原来的 setExploded，让按钮和滑杆写同一份 0..1。
 * 目标挂在 __ea。__es 为真时时钟直接落到目标。
 */

const wrapped = new WeakSet<(exploded: boolean) => void>()

function releaseHeldViewpoint(): void {
  if (typeof window === 'undefined') return
  window.__vpH = false
}

function hintedAim(): number | undefined {
  const raw = (globalThis as { __ea?: number }).__ea
  return typeof raw === 'number' ? clampExplodeProgress(raw) : undefined
}

export function installExplodeProgress(): void {
  const current = useTwinStore.getState().setExploded
  if (wrapped.has(current)) return

  const state = useTwinStore.getState()
  const hinted = hintedAim()
  const explodeProgress =
    typeof state.explodeProgress === 'number' ? clampExplodeProgress(state.explodeProgress) : (hinted ?? (state.exploded ? 1 : 0))
  if (explodeProgress > 0 || hinted != null) (globalThis as { __ea?: number }).__ea = explodeProgress
  if (state.exploded !== (explodeProgress > 0)) state.setExploded(explodeProgress > 0)
  if (useTwinStore.getState().explodeProgress !== explodeProgress) {
    useTwinStore.setState({ explodeProgress, exploded: explodeProgress > 0 })
  }

  const base = useTwinStore.getState().setExploded
  const write = (value: number) => {
    const next = clampExplodeProgress(value)
    const exploded = next > 0
    const now = useTwinStore.getState()
    ;(globalThis as { __ea?: number }).__ea = next
    if (now.explodeProgress === next && now.exploded === exploded) return
    if (now.exploded !== exploded) base(exploded)
    else releaseHeldViewpoint()
    const patch: { exploded: boolean; explodeProgress: number; vp?: null } = { exploded, explodeProgress: next }
    if (now.exploded === exploded && now.vp != null) patch.vp = null
    useTwinStore.setState(patch)
  }
  const setExploded = (exploded: boolean) => {
    ;(globalThis as { __es?: boolean }).__es = false
    write(exploded ? 1 : 0)
  }
  wrapped.add(setExploded)
  useTwinStore.setState({ setExploded, setExplodeProgress: write })
}
