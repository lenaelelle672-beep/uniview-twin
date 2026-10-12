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
  compileClippedShellMaterials,
  compileDummyLabelMaterial,
  compileInteriorMaterials,
  glyphPreloadBlocked,
  glyphPreloadStartReady,
  glyphTimingProbeEnabled,
  installAtlasCanvasHook,
  installGlyphPauseHooks,
  installSdfAtlasHook,
  installTexImage2DHook,
  notePreloadPause,
  overviewIdleBlocked,
  preloadFloorEntryFont,
  preloadLabelChars,
  scheduleIdleWork,
  startEntryFrameWatch,
  takeGlyphBudget,
  unseenGlyphs,
  uploadSdfTexture,
  warmupFontParse,
  warmupTextMesh,
} from './glyphProbe'

export { preloadFloorEntryFont }

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
  const started = performance.now()
  const longTasks: number[] = []
  let observer: PerformanceObserver | null = null
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration)
      })
      observer.observe({ type: 'longtask', buffered: false })
    } catch {
      observer = null
    }
  }
  try {
    const res = await fetch(ROOM_LABEL_FONT, { cache: 'force-cache' })
    let buf: ArrayBuffer | null = await res.arrayBuffer()
    const bytes = buf.byteLength
    buf = null
    if (window.__twinGlyphPreload) {
      window.__twinGlyphPreload.fontPrefetch = {
        at: started,
        ms: Math.round(performance.now() - started),
        bytes,
        afterFirstMs:
          window.__twinFirstFrameAt != null ? Math.round(started - window.__twinFirstFrameAt) : null,
        longTaskMs: longTasks.length ? Math.round(Math.max(...longTasks)) : 0,
      }
    }
  } catch {
    // 解析仍走 troika；这里只是提前把 woff 放进 HTTP 缓存。
  } finally {
    observer?.disconnect()
  }
}

/**
 * D266.1：第一次 preloadFont 只传 ' '，起点 = max(首帧+5s, 均衡后处理已编译 且 textRuntime 已预取)。
 * D266.2：字形齐后总览空闲 initTexture(sdfTexture)，指针按下或相机在动则推迟。
 */
export function scheduleGlyphPreload(): () => void {
  if (typeof window === 'undefined') return () => {}
  if (window.__twinFirstFrameAt == null) return () => {}
  installSdfAtlasHook()
  installAtlasCanvasHook()
  installGlyphPauseHooks()
  installTexImage2DHook()
  startEntryFrameWatch()
  if (glyphTimingProbeEnabled()) window.__twinNotePreloadPause = notePreloadPause
  if (window.__twinGlyphPreload == null) {
    window.__twinGlyphPreload = {
      batchSize: GLYPH_BATCH,
      firstBatchSize: GLYPH_FIRST_BATCH,
      batches: [],
      done: false,
      atlasGrows: [],
      unique: 0,
      newOnEntry: {},
      paused: true,
    }
  }
  void compileClippedShellMaterials().then((ok) => {
    if (ok && window.__twinGlyphPreload) window.__twinGlyphPreload.shellClip = true
  })
  if (window.__twinTextRuntimeAt == null) void import('./textRuntime')
  let cancelled = false
  let idleId = 0
  let remaining = ''
  let charsQueued = false
  let warmedFont = false
  let warmedGl = false
  let warmedMesh = false
  let firstMain = true
  let uploaded = false
  let compiled = false
  let fontPrefetch: 'idle' | 'wait' | 'done' = 'idle'

  const tick = (deadline: { timeRemaining: () => number }) => {
    if (cancelled) return
    if (window.__twinFirstFrameAt == null || !glyphPreloadStartReady()) {
      if (window.__twinGlyphPreload) window.__twinGlyphPreload.paused = true
      idleId = scheduleIdleWork(tick)
      return
    }
    if (glyphPreloadBlocked()) {
      notePreloadPause()
      idleId = scheduleIdleWork(tick)
      return
    }
    if (fontPrefetch !== 'done') {
      if (fontPrefetch === 'idle') {
        fontPrefetch = 'wait'
        const fetchAt = performance.now()
        void prefetchFontBytes().then(() => {
          fontPrefetch = 'done'
          if (window.__twinGlyphPreload) {
            window.__twinGlyphPreload.spaceFetchMs = Math.round(performance.now() - fetchAt)
            if (window.__twinGlyphPreload.spaceCall) {
              window.__twinGlyphPreload.spaceCall = {
                ...window.__twinGlyphPreload.spaceCall,
                fetchMs: window.__twinGlyphPreload.spaceFetchMs,
              }
            }
          }
          idleId = scheduleIdleWork(tick)
        })
      }
      return
    }
    if (window.__twinGlyphPreload) window.__twinGlyphPreload.paused = false
    if (!warmedFont) {
      if (deadline.timeRemaining() < 0.2) {
        idleId = scheduleIdleWork(tick)
        return
      }
      if (window.__twinGlyphPreload) window.__twinGlyphPreload.startedAt = performance.now()
      const started = performance.now()
      void watchMaxFrame(() =>
        warmupFontParse().then((row) => {
          if (cancelled) return
          if (row.deferred) {
            idleId = scheduleIdleWork(tick)
            return
          }
          const frameMs = Math.round(performance.now() - started)
          recordBatch({
            i: -2,
            chars: 1,
            ms: Math.round(row.ms),
            maxFrame: frameMs,
            seen: window.__twinGlyphPreload?.unique ?? 0,
            kind: 'warmup:space',
          })
          if (window.__twinGlyphPreload) {
            window.__twinGlyphPreload.warmup = [
              ...(window.__twinGlyphPreload.warmup ?? []),
              { kind: 'space', ms: Math.round(row.ms), maxFrame: frameMs, atlasHeight: row.atlasHeight },
            ]
            window.__twinGlyphPreload.atlasHeight = row.atlasHeight ?? window.__twinGlyphPreload.atlasHeight
            window.__twinGlyphPreload.spaceCall = {
              ...(window.__twinGlyphPreload.spaceCall ?? {}),
              at: window.__twinGlyphPreload.spaceCall?.at ?? started,
              ms: Math.round(row.ms),
              frameMs,
              fetchMs: window.__twinGlyphPreload.spaceFetchMs ?? window.__twinGlyphPreload.spaceCall?.fetchMs,
              atlasMs: window.__twinGlyphPreload.spaceCall?.atlasMs,
              parseMs: window.__twinGlyphPreload.spaceCall?.parseMs,
              canvasMs: window.__twinGlyphPreload.spaceCall?.canvasMs,
              sdfMs: window.__twinGlyphPreload.spaceCall?.sdfMs,
              compileCount: window.__twinGlyphPreload.spaceCall?.compileCount,
            }
          }
          warmedFont = true
          idleId = scheduleIdleWork(tick)
        }),
      )
      return
    }
    if (!charsQueued) {
      charsQueued = true
      void queueFloorGlyphChars().then((next) => {
        if (cancelled) return
        remaining = unseenGlyphs(next)
        idleId = scheduleIdleWork(tick)
      })
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
      if (uploaded && compiled) return
      if (overviewIdleBlocked() || !window.__twinRenderer) {
        idleId = scheduleIdleWork(tick)
        return
      }
      if (!uploaded) {
        uploaded = true
        void watchMaxFrame(async () => {
          try {
            const row = await uploadSdfTexture()
            if (cancelled) return
            if (window.__twinGlyphPreload && row) {
              window.__twinGlyphPreload.upload = {
                at: performance.now() - row.ms,
                ms: Math.round(row.ms),
                frameMs: Math.round(row.frameMs),
              }
            }
          } catch {
            uploaded = false
          }
        }).then(() => {
          if (cancelled) return
          if (!window.__twinGlyphPreload?.uploaded) {
            uploaded = false
          }
          idleId = scheduleIdleWork(tick)
        })
        return
      }
      compiled = true
      void watchMaxFrame(async () => {
        const label = await compileDummyLabelMaterial()
        if (cancelled) return
        if (!label) {
          compiled = false
          return
        }
        await compileInteriorMaterials()
        if (!cancelled && !glyphPreloadBlocked()) await compileClippedShellMaterials()
      }).then(() => {
        if (cancelled) return
        if (!window.__twinGlyphPreload?.compile) {
          compiled = false
          idleId = scheduleIdleWork(tick)
        }
      })
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
