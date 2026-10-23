/**
 * T062：短时画面录制的纯策略。
 * 不碰 three / R3F / 雾 / 后处理。调用方只在晚加载入口里使用。
 */

export const CLIP_MIN_MS = 5_000
export const CLIP_MAX_MS = 15_000
export const CLIP_FILENAME = 'uniview-clip.webm'

/** 只要 webm。没有可用类型就当禁录，不改去下别的格式。 */
export const CLIP_MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] as const

export type FrameloopMode = 'always' | 'demand' | 'never'

export interface ClipClock {
  elapsedTime: number
}

/**
 * R3F root state 上我们只用到的几项。
 * `setFrameloop` 在 store 里会 `clock.stop()` 并把 `elapsedTime` 写成 0。
 */
export interface ClipFrameloop {
  frameloop?: FrameloopMode
  clock?: ClipClock
  setFrameloop: (mode: FrameloopMode) => void
}

export function pickClipMime(supported: (mime: string) => boolean): string | null {
  for (const mime of CLIP_MIME_CANDIDATES) {
    try {
      if (supported(mime)) return mime
    } catch {
      // 某个候选探测抛错就换下一个。
    }
  }
  return null
}

/** 未请求停则停在 15s；请求停则不早于 5s、不晚于 15s。 */
export function clipStopAt(
  startedAt: number,
  now: number,
  stopRequested: boolean,
  minMs = CLIP_MIN_MS,
  maxMs = CLIP_MAX_MS,
): number {
  const cap = startedAt + maxMs
  if (!stopRequested) return cap
  if (now >= cap) return cap
  const earliest = startedAt + minMs
  if (now >= earliest) return now
  return earliest
}

/**
 * 录制期把 frameloop 改成 always，结束恢复 demand。
 *
 * R3F 9.8 `setFrameloop` 每次都会把 THREE.Clock.elapsedTime 归零
 * （人物和爆炸读的是 elapsedTime）。Canvas 上的 `frameloop="demand"` 只在
 * prop 变化时重放，运行时改成 always 会保持到我们再写回 demand。
 * 所以两头都在调用后立刻把 elapsedTime 写回去。
 * 没有 root 时返回空函数，调用方改靠 invalidate 把 demand 泵成连续帧。
 */
export function holdContinuousFrameloop(state: ClipFrameloop | null | undefined): () => void {
  if (!state || typeof state.setFrameloop !== 'function') return () => {}
  const clock = state.clock
  const before = clock?.elapsedTime
  let engaged = false
  try {
    state.setFrameloop('always')
    engaged = true
  } catch {
    engaged = false
  }
  if (clock && typeof before === 'number') clock.elapsedTime = before
  if (!engaged) return () => {}
  let restored = false
  return () => {
    if (restored) return
    restored = true
    const held = clock?.elapsedTime
    try {
      state.setFrameloop('demand')
    } catch {
      // 恢复失败也不抛到点击路径上。
    }
    if (clock && typeof held === 'number') clock.elapsedTime = held
  }
}

/** `window.__twinScene.__r3f.root` 就是 R3F store。不 import fiber，避免首屏多出导出。 */
export function rootStateFromScene(scene: object | null | undefined): ClipFrameloop | null {
  if (!scene) return null
  const root = (scene as { __r3f?: { root?: { getState?: () => unknown } } }).__r3f?.root
  const state = root?.getState?.()
  if (!state || typeof state !== 'object') return null
  if (typeof (state as { setFrameloop?: unknown }).setFrameloop !== 'function') return null
  return state as ClipFrameloop
}

export function clipBlob(chunks: readonly Blob[], mime: string): Blob | null {
  const parts = chunks.filter((chunk) => chunk.size > 0)
  if (parts.length === 0) return null
  const blob = new Blob(parts, { type: mime || 'video/webm' })
  return blob.size > 0 ? blob : null
}
