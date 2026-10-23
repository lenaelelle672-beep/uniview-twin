/**
 * T056：报告截图只活在这次页面会话里，刷新就丢。
 * 和截图逻辑拆开，报告页可以同步读到地址，不必提前加载 shareShot。
 */

export interface ReportShotState {
  url: string | null
  note: string
  pending: boolean
}

type Listener = (state: ReportShotState) => void

let url: string | null = null
let note = ''
let pending = false
const listeners = new Set<Listener>()

export function reportShotState(): ReportShotState {
  return { url, note, pending }
}

export function subscribeReportShot(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function publishReportShot(next: { url?: string | null; note?: string; pending?: boolean }): void {
  if (next.url !== undefined) url = next.url
  if (next.note !== undefined) note = next.note
  if (next.pending !== undefined) pending = next.pending
  const snap = reportShotState()
  for (const listener of listeners) listener(snap)
}

export function resetReportShot(): void {
  url = null
  note = ''
  pending = false
  listeners.clear()
}
