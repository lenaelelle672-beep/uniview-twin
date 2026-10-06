import { getFloorPlan } from '../../floors/cache'
import { loadFloorPlan } from '../../floors/loadFloor'
import { roomLabelsFromPlan } from '../../floors/labels'
import { clusterTemplates } from './labelAvoidance'
import { roomLabelCharacters } from './roomLabels'
import {
  GLYPH_BATCH,
  GLYPH_FIRST_BATCH,
  cancelIdleWork,
  chunkGlyphs,
  installSdfAtlasHook,
  preloadLabelChars,
  scheduleIdleWork,
  unseenGlyphs,
} from './glyphProbe'

export const GLYPH_PRELOAD_FLOORS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as const

export function floorLabelCharacters(floorId: string): string {
  const plan = getFloorPlan(floorId)
  if (!plan) return ''
  const labels = roomLabelsFromPlan(plan)
  const clusters = clusterTemplates(labels)
    .map((row) => row.text)
    .join('')
  return roomLabelCharacters(labels) + clusters
}

export async function queueFloorGlyphChunks(): Promise<string[]> {
  const pending: string[] = []
  for (const floorId of GLYPH_PRELOAD_FLOORS) {
    await loadFloorPlan(floorId)
    pending.push(unseenGlyphs(floorLabelCharacters(floorId)))
  }
  return chunkGlyphs(pending.join(''), GLYPH_FIRST_BATCH, GLYPH_BATCH)
}

function recordBatch(row: NonNullable<Window['__twinGlyphPreload']>['batches'][number]) {
  const probe = window.__twinGlyphPreload ?? {
    batchSize: GLYPH_BATCH,
    firstBatchSize: GLYPH_FIRST_BATCH,
    batches: [],
    done: false,
    atlasGrows: [],
    unique: 0,
    newOnEntry: {},
  }
  probe.batches = [...probe.batches, row]
  window.__twinGlyphPreload = probe
}

/**
 * 首帧之后才跑。每 idle 回调只 preload 一小段字。
 * useWorker:false 时一段字是同步 SDF，所以必须切批。
 */
export function scheduleGlyphPreload(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (window.__twinFirstFrameAt == null) return () => {}
  installSdfAtlasHook()
  let cancelled = false
  let idleId = 0
  let chunks: string[] = []
  let index = 0

  const tick = (deadline: { timeRemaining: () => number }) => {
    if (cancelled) return
    if (window.__twinFirstFrameAt == null) {
      idleId = scheduleIdleWork(tick)
      return
    }
    if (chunks.length === 0) {
      void queueFloorGlyphChunks().then((next) => {
        if (cancelled) return
        chunks = next
        idleId = scheduleIdleWork(tick)
      })
      return
    }
    if (index >= chunks.length) {
      if (window.__twinGlyphPreload) window.__twinGlyphPreload.done = true
      return
    }
    if (deadline.timeRemaining() < 1.5 && index > 0) {
      idleId = scheduleIdleWork(tick)
      return
    }
    const chunk = chunks[index] ?? ''
    const started = performance.now()
    void preloadLabelChars(chunk, `preload:${index}`).then(() => {
      if (cancelled) return
      recordBatch({
        i: index,
        chars: chunk.length,
        ms: Math.round(performance.now() - started),
        maxFrame: Math.round(performance.now() - started),
        seen: window.__twinGlyphPreload?.unique ?? 0,
      })
      index += 1
      idleId = scheduleIdleWork(tick)
    })
  }

  idleId = scheduleIdleWork(tick)
  return () => {
    cancelled = true
    cancelIdleWork(idleId)
  }
}
