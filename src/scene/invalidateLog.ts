/** 仅 DEV。生产构建 tree-shake，不进硬门禁。 */

export interface InvalidateLogEntry {
  t: number
  src: string
}

const RING = 400

function classifyStack(stack: string | undefined): string {
  if (!stack) return 'unknown'
  if (/DemandLoop/.test(stack)) return 'demand-loop'
  if (/ExplodedLayout/.test(stack)) return 'explode'
  if (/FloorBadges/.test(stack)) return 'floor-badges'
  if (/RenderProbe/.test(stack)) return 'render-probe'
  if (/BatchedRoomLabels|troika/i.test(stack)) return 'troika'
  if (/DeviceBadges/.test(stack)) return 'device-badges'
  if (/CameraRig|CameraControls/.test(stack)) return 'camera'
  if (/AdaptiveDpr/.test(stack)) return 'adaptive-dpr'
  if (/DeskFlash/.test(stack)) return 'desk-flash'
  if (/CorridorPeople/.test(stack)) return 'people'
  return 'other'
}

export function markInvalidateSrc(src: string): void {
  if (!import.meta.env.DEV) return
  window.__twinInvalidateNext = src
}

export function recordInvalidate(fallback: string): void {
  if (!import.meta.env.DEV) return
  const src = window.__twinInvalidateNext || fallback
  delete window.__twinInvalidateNext
  const counts = (window.__twinInvalidateCounts ??= {})
  counts[src] = (counts[src] ?? 0) + 1
  const log = (window.__twinInvalidateLog ??= [])
  log.push({ t: performance.now(), src })
  if (log.length > RING) log.splice(0, log.length - RING)
}

export function installInvalidateTrace(state: { invalidate: () => void }): void {
  if (!import.meta.env.DEV) return
  const tagged = state.invalidate as { __twinTraced?: boolean }
  if (tagged.__twinTraced) return
  const raw = state.invalidate.bind(state)
  const wrapped = () => {
    recordInvalidate(classifyStack(new Error().stack))
    raw()
  }
  ;(wrapped as { __twinTraced?: boolean }).__twinTraced = true
  state.invalidate = wrapped
}
