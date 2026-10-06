import { getFloorPlan } from '../../floors/cache'
import { loadFloorPlan } from '../../floors/loadFloor'
import { roomLabelsFromPlan } from '../../floors/labels'
import { clusterTemplates } from './labelAvoidance'
import { ROOM_LABEL_FONT, roomLabelCharacters } from './roomLabels'
import {
  GLYPH_BATCH,
  GLYPH_FIRST_BATCH,
  GLYPH_WARMUP_GLYPH,
  cancelIdleWork,
  glyphPreloadBlocked,
  installAtlasCanvasHook,
  installGlyphPauseHooks,
  installSdfAtlasHook,
  preloadLabelChars,
  scheduleIdleWork,
  takeGlyphBudget,
  unseenGlyphs,
  warmupFontParse,
  warmupTextMesh,
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

export async function queueFloorGlyphChars(): Promise<string> {
  const pending: string[] = []
  for (const floorId of GLYPH_PRELOAD_FLOORS) {
    await loadFloorPlan(floorId)
    pending.push(unseenGlyphs(floorLabelCharacters(floorId)))
  }
  return unseenGlyphs(pending.join(''))
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

function watchMaxFrame(during: () => Promise<void>): Promise<number> {
  let last = performance.now()
  let max = 0
  let alive = true
  const tick = () => {
    if (!alive) return
    const now = performance.now()
    max = Math.max(max, now - last)
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return during().then(() => {
    alive = false
    return Math.round(max)
  })
}

async function prefetchFontBytes() {
  try {
    await fetch(ROOM_LABEL_FONT, { cache: 'force-cache' })
  } catch {
    // 解析仍走 troika；这里只是提前把 woff 放进 HTTP 缓存。
  }
}

/**
 * 首帧之后才跑。字体解析 / GL 自检拆成两段 idle，之后按 timeRemaining 切片。
 * 指针按下或进层相机在动时暂停，rest 后再续。
 */
export function scheduleGlyphPreload(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (window.__twinFirstFrameAt == null) return () => {}
  installSdfAtlasHook()
  installAtlasCanvasHook()
  installGlyphPauseHooks()
  let cancelled = false
  let idleId = 0
  let remaining = ''
  let loaded = false
  let warmedFont = false
  let warmedGl = false
  let warmedMesh = false
  let firstMain = true

  const tick = (deadline: { timeRemaining: () => number }) => {
    if (cancelled) return
    if (window.__twinFirstFrameAt == null) {
      idleId = scheduleIdleWork(tick)
      return
    }
    if (glyphPreloadBlocked()) {
      if (window.__twinGlyphPreload) window.__twinGlyphPreload.paused = true
      idleId = scheduleIdleWork(tick)
      return
    }
    if (window.__twinGlyphPreload) window.__twinGlyphPreload.paused = false
    if (!loaded) {
      void prefetchFontBytes().then(() =>
        queueFloorGlyphChars().then((next) => {
          if (cancelled) return
          remaining = unseenGlyphs(next)
          loaded = true
          idleId = scheduleIdleWork(tick)
        }),
      )
      return
    }
    if (!warmedFont) {
      if (deadline.timeRemaining() < 0.2) {
        idleId = scheduleIdleWork(tick)
        return
      }
      const started = performance.now()
      void watchMaxFrame(() =>
        warmupFontParse().then((row) => {
          if (cancelled) return
          recordBatch({
            i: -2,
            chars: 1,
            ms: Math.round(row.ms),
            maxFrame: Math.round(row.ms),
            seen: window.__twinGlyphPreload?.unique ?? 0,
            kind: 'warmup:space',
          })
          if (window.__twinGlyphPreload) {
            window.__twinGlyphPreload.warmup = [
              ...(window.__twinGlyphPreload.warmup ?? []),
              { kind: 'space', ms: Math.round(row.ms), maxFrame: Math.round(performance.now() - started), atlasHeight: row.atlasHeight },
            ]
            window.__twinGlyphPreload.atlasHeight = row.atlasHeight ?? window.__twinGlyphPreload.atlasHeight
          }
          warmedFont = true
          idleId = scheduleIdleWork(tick)
        }),
      )
      return
    }
    if (!warmedGl) {
      if (deadline.timeRemaining() < 0.2) {
        idleId = scheduleIdleWork(tick)
        return
      }
      const glyph = remaining.includes(GLYPH_WARMUP_GLYPH) ? GLYPH_WARMUP_GLYPH : remaining.slice(0, 1) || GLYPH_WARMUP_GLYPH
      const started = performance.now()
      void watchMaxFrame(() => preloadLabelChars(glyph, 'warmup:gl').then(() => undefined)).then((maxFrame) => {
        if (cancelled) return
        remaining = unseenGlyphs(remaining)
        const ms = Math.round(performance.now() - started)
        recordBatch({
          i: -1,
          chars: 1,
          ms,
          maxFrame,
          seen: window.__twinGlyphPreload?.unique ?? 0,
          kind: 'warmup:gl',
        })
        if (window.__twinGlyphPreload) {
          window.__twinGlyphPreload.warmup = [
            ...(window.__twinGlyphPreload.warmup ?? []),
            { kind: 'gl', ms, maxFrame, atlasHeight: window.__twinGlyphPreload.atlasHeight ?? null },
          ]
        }
        warmedGl = true
        idleId = scheduleIdleWork(tick)
      })
      return
    }
    if (!warmedMesh) {
      if (deadline.timeRemaining() < 0.2) {
        idleId = scheduleIdleWork(tick)
        return
      }
      const started = performance.now()
      void watchMaxFrame(() => warmupTextMesh().then(() => undefined)).then((maxFrame) => {
        if (cancelled) return
        const ms = Math.round(performance.now() - started)
        recordBatch({
          i: -3,
          chars: 1,
          ms,
          maxFrame,
          seen: window.__twinGlyphPreload?.unique ?? 0,
          kind: 'warmup:mesh',
        })
        if (window.__twinGlyphPreload) {
          window.__twinGlyphPreload.warmup = [
            ...(window.__twinGlyphPreload.warmup ?? []),
            { kind: 'mesh', ms, maxFrame, atlasHeight: window.__twinGlyphPreload.atlasHeight ?? null },
          ]
        }
        warmedMesh = true
        idleId = scheduleIdleWork(tick)
      })
      return
    }
    if (!remaining) {
      if (window.__twinGlyphPreload) window.__twinGlyphPreload.done = true
      return
    }
    if (deadline.timeRemaining() < 0.2) {
      idleId = scheduleIdleWork(tick)
      return
    }
    const slice = firstMain ? remaining.slice(0, GLYPH_FIRST_BATCH) : takeGlyphBudget(remaining, deadline, GLYPH_BATCH)
    firstMain = false
    if (!slice) {
      idleId = scheduleIdleWork(tick)
      return
    }
    const started = performance.now()
    const index = window.__twinGlyphPreload?.batches.filter((row) => (row.i ?? 0) >= 0).length ?? 0
    void watchMaxFrame(() => preloadLabelChars(slice, `preload:${index}`).then(() => undefined)).then((maxFrame) => {
      if (cancelled) return
      remaining = unseenGlyphs(remaining.slice(slice.length))
      recordBatch({
        i: index,
        chars: slice.length,
        ms: Math.round(performance.now() - started),
        maxFrame,
        seen: window.__twinGlyphPreload?.unique ?? 0,
        kind: 'batch',
      })
      idleId = scheduleIdleWork(tick)
    })
  }

  idleId = scheduleIdleWork(tick)
  return () => {
    cancelled = true
    cancelIdleWork(idleId)
  }
}
