/**
 * T118：首帧只认一次。
 * RenderProbe 的相机依赖变了会清掉首帧和就绪标记。
 * 正交相机如果跟着退回 off-first-frame，makeDefault 刚换上就会被卸掉。
 * 这里记住换相机之前的标记，清掉之后写回去。不改 RenderProbe，避免动 hardGate。
 */

export interface ReadyMarks {
  ready: boolean
  readyAt: number | null
  suspense: boolean
  treeAt: number | null
  firstAt: number | null
  firstUnix: number | null
}

export interface ReadyWindow {
  __twinReady?: boolean
  __twinReadyAt?: number
  __twinSuspenseReady?: boolean
  __twinTreeLoReadyAt?: number
  __twinFirstFrameAt?: number
  __twinFirstFrameUnixMs?: number
}

export function notePresented(seen: boolean, firstFrameAt: number | null | undefined): boolean {
  if (seen) return false
  return typeof firstFrameAt === 'number' && Number.isFinite(firstFrameAt)
}

export function captureReadyMarks(source: ReadyWindow): ReadyMarks {
  return {
    ready: source.__twinReady === true,
    readyAt: typeof source.__twinReadyAt === 'number' ? source.__twinReadyAt : null,
    suspense: source.__twinSuspenseReady === true,
    treeAt: typeof source.__twinTreeLoReadyAt === 'number' ? source.__twinTreeLoReadyAt : null,
    firstAt: typeof source.__twinFirstFrameAt === 'number' ? source.__twinFirstFrameAt : null,
    firstUnix: typeof source.__twinFirstFrameUnixMs === 'number' ? source.__twinFirstFrameUnixMs : null,
  }
}

/** 空快照不能覆盖已经记住的就绪标记。 */
export function rememberReadyMarks(prev: ReadyMarks | null, next: ReadyMarks): ReadyMarks {
  if (next.ready || next.firstAt != null || next.treeAt != null) return next
  return prev ?? next
}

/** 记过的标记被清掉了。树组件不会因为这次清理再写一次。 */
export function readyMarksLost(snap: ReadyMarks | null, live: ReadyWindow): boolean {
  if (!snap) return false
  if (snap.ready && live.__twinReady !== true) return true
  if (snap.suspense && live.__twinSuspenseReady !== true) return true
  if (snap.treeAt != null && live.__twinTreeLoReadyAt == null) return true
  if (snap.firstAt != null && live.__twinFirstFrameAt == null) return true
  if (snap.readyAt != null && live.__twinReadyAt == null) return true
  if (snap.firstUnix != null && live.__twinFirstFrameUnixMs == null) return true
  return false
}

export function restoreReadyMarks(target: ReadyWindow, snap: ReadyMarks): void {
  if (snap.treeAt != null && target.__twinTreeLoReadyAt == null) target.__twinTreeLoReadyAt = snap.treeAt
  if (snap.suspense && target.__twinSuspenseReady !== true) target.__twinSuspenseReady = true
  if (snap.readyAt != null && target.__twinReadyAt == null) target.__twinReadyAt = snap.readyAt
  if (snap.ready && target.__twinReady !== true) target.__twinReady = true
  if (snap.firstUnix != null && target.__twinFirstFrameUnixMs == null) target.__twinFirstFrameUnixMs = snap.firstUnix
  if (snap.firstAt != null && target.__twinFirstFrameAt == null) target.__twinFirstFrameAt = snap.firstAt
}
