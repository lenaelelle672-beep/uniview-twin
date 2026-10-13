import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { clusterTemplates } from './labelAvoidance'
import { roomLabelCharacters } from './roomLabels'
import {
  GLYPH_BATCH,
  GLYPH_FIRST_BATCH,
  GLYPH_MS_PER,
  chunkGlyphs,
  diffProgramCacheKeys,
  glyphTimingProbeEnabled,
  notePreloadPause,
  resetGlyphProbe,
  setGlyphPointerDown,
  takeGlyphBudget,
} from './glyphProbe'
import { GLYPH_PRELOAD_FLOORS, floorLabelCharacters } from './preloadFloorGlyphs'

hydrateAllAboveGrade()

describe('D262/D264 字形预排', () => {
  it('F1–F8 去重后约 285 字，切成首批 4 + 之后最多 60', () => {
    const all = GLYPH_PRELOAD_FLOORS.map((floorId) => {
      const plan = getFloorPlan(floorId)!
      const labels = roomLabelsFromPlan(plan)
      return roomLabelCharacters(labels) + clusterTemplates(labels).map((row) => row.text).join('')
    }).join('')
    const unique = Array.from(new Set(Array.from(all)))
    expect(unique.length).toBeGreaterThan(250)
    expect(unique.length).toBeLessThan(320)
    expect(unique.length).toBeGreaterThanOrEqual(280)
    expect(unique.length).toBeLessThanOrEqual(290)
    const chunks = chunkGlyphs(unique.join(''))
    expect(chunks[0]?.length).toBe(GLYPH_FIRST_BATCH)
    expect(GLYPH_FIRST_BATCH).toBe(4)
    expect(GLYPH_BATCH).toBe(60)
    expect(chunks.slice(1).every((chunk) => chunk.length <= GLYPH_BATCH)).toBe(true)
    expect(chunks.join('').length).toBe(unique.length)
    expect(floorLabelCharacters('F1').length).toBeGreaterThan(80)
    expect(takeGlyphBudget('abcdefghij', { timeRemaining: () => 0.8 }, 60).length).toBe(Math.floor(0.8 / GLYPH_MS_PER))
  })

  it('预排在首帧后按 idle 切批，指针按下/相机运动暂停，不进 prefetch 主路径的静态依赖', () => {
    const prefetch = readFileSync(new URL('./prefetchLazyChunks.ts', import.meta.url), 'utf8')
    expect(prefetch).toMatch(/__twinFirstFrameAt/)
    expect(prefetch).toMatch(/import\('\.\/preloadFloorGlyphs'\)/)
    expect(prefetch).not.toMatch(/from '\.\/preloadFloorGlyphs'/)
    const preload = readFileSync(new URL('./preloadFloorGlyphs.ts', import.meta.url), 'utf8')
    expect(preload).toMatch(/scheduleIdleWork/)
    expect(preload).toMatch(/timeRemaining/)
    expect(preload).toMatch(/GLYPH_FIRST_BATCH/)
    expect(preload).toMatch(/warmupFontParse/)
    expect(preload).toMatch(/warmupTextMesh/)
    expect(preload).toMatch(/glyphPreloadBlocked/)
    expect(preload).toMatch(/window\.__twinFirstFrameAt == null/)
    const probe = readFileSync(new URL('./glyphProbe.ts', import.meta.url), 'utf8')
    expect(probe).toMatch(/Increasing SDF texture size/)
    expect(probe).toMatch(/GLYPH_BATCH = 60/)
    expect(probe).toMatch(/GLYPH_FIRST_BATCH = 4/)
    expect(probe).toMatch(/pointerdown/)
    expect(probe).toMatch(/notePreloadPause/)
    expect(probe).toMatch(/pauseCounts/)
    expect(preload).toMatch(/prefetchFontBytes/)
    expect(preload).toMatch(/fontPrefetch/)
    expect(probe).toMatch(/__twinView/)
    expect(probe).toMatch(/__twinCameraMoveAt/)
    expect(probe).toMatch(/GLYPH_PRELOAD_AFTER_FIRST_MS = 5000/)
    expect(probe).toMatch(/preloadFont/)
    expect(probe).toMatch(/GLYPH_WARMUP_SPACE/)
    expect(probe).toMatch(/initTexture/)
    expect(probe).toMatch(/__twinTextRuntimeAt/)
    expect(probe).toMatch(/__twinWarmup/)
    expect(probe).toMatch(/compileAsync/)
    expect(probe).toMatch(/__twinScene/)
    expect(probe).toMatch(/__twinComposerInput/)
    expect(probe).toMatch(/setRenderTarget/)
    expect(probe).toMatch(/shaderSource/)
    expect(probe).toMatch(/uTroikaSDFTexture/)
    expect(probe).toMatch(/uTroikaMatricesTexture/)
    expect(probe).not.toMatch(/new Scene\(/)
    expect(probe).toMatch(/return overviewIdleBlocked\(\)/)
    const entryFont = probe.slice(probe.indexOf('export function preloadFloorEntryFont'))
    expect(entryFont.startsWith('export function preloadFloorEntryFont')).toBe(true)
    expect(entryFont.slice(0, entryFont.indexOf('export async function preloadLabelChars'))).not.toMatch(/glyphPreloadBlocked/)
    expect(probe).toMatch(/__twinFirstFrameAt == null/)
    const pump = probe.slice(probe.indexOf('async function pumpEntryFont'), probe.indexOf('export function preloadFloorEntryFont'))
    expect(pump).toMatch(/preloadFontFn/)
    expect(pump).not.toMatch(/chunkGlyphs/)
    expect(pump).not.toMatch(/glyphPreloadBlocked/)
    const room = readFileSync(new URL('./RoomLabels.tsx', import.meta.url), 'utf8')
    expect(room).toMatch(/preloadFloorEntryFont\(`\$\{characters\} `\)/)
    expect(room).toMatch(/preloadLabelChars/)
    const interior = readFileSync(new URL('../../floors/JsonFloorInterior.tsx', import.meta.url), 'utf8')
    expect(interior).toMatch(/preloadFloorEntryFont/)
    expect(interior).toMatch(/import\('\.\.\/scene\/stage\/glyphProbe'\)/)
    expect(probe).toMatch(/installSpaceSplitHooks/)
    expect(probe).toMatch(/glyphTimingProbeEnabled/)
    expect(probe).toMatch(/keepDrawingBuffer/)
    expect(probe).toMatch(/PerformanceObserver/)
    expect(probe).toMatch(/longtask/)
    expect(probe).toMatch(/atlasFrameMs/)
    expect(probe).toMatch(/parseFrameMs/)
    expect(probe).toMatch(/atlasMs/)
    expect(probe).toMatch(/parseMs/)
    expect(probe).toMatch(/GLYPH_WARMUP_SPACE/)
    expect(probe).not.toMatch(/sdfGlyphSize:\s*8/)
    expect(prefetch).toMatch(/import\('\.\/textRuntime'\)/)
    expect(prefetch).toMatch(/import\('\.\/FloorStageCamera'\)/)
    expect(prefetch).toMatch(/import\('\.\.\/\.\.\/floors\/JsonFloorInterior'\)/)
    expect(prefetch).not.toMatch(/NotoSansSC-Regular-subset\.woff/)
    expect(prefetch.indexOf("import('./textRuntime')")).toBeLessThan(prefetch.indexOf("import('./preloadFloorGlyphs')"))
    expect(pump).toMatch(/__twinCameraMoveAt/)
    expect(preload).toMatch(/arrayBuffer\(\)/)
    expect(preload).toMatch(/buf = null/)
    expect(preload).toMatch(/fontPrefetch/)
    expect(preload).toMatch(/glyphPreloadStartReady/)
    expect(preload).toMatch(/__twinNotePreloadPause/)
    expect(preload).toMatch(/uploadSdfTexture/)
    expect(preload).toMatch(/overviewIdleBlocked/)
    expect(preload).toMatch(/compileDummyLabelMaterial/)
    expect(preload).toMatch(/compileInteriorMaterials/)
    expect(preload).toMatch(/compileClippedShellMaterials/)
    expect(probe).toMatch(/localClippingEnabled = clippingWas/)
    expect(probe).toMatch(/retainedClipObjects/)
    expect(preload).not.toMatch(/textureWidth:\s*4096/)
    expect(probe).not.toMatch(/from 'troika-three-text'/)
    expect(probe).not.toMatch(/import\('troika-three-text'\)/)
    expect(probe).toMatch(/import\('\.\/disableTroikaCdn'\)/)
    const cdn = readFileSync(new URL('./disableTroikaCdn.ts', import.meta.url), 'utf8')
    expect(cdn).toMatch(/from 'troika-three-text'/)
    expect(cdn).toMatch(/applyTroikaConfig\(\)/)
    const batch = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    expect(batch).not.toMatch(/from 'troika-three-text'/)
    expect(batch).toMatch(/from '\.\/disableTroikaCdn'/)
    expect(batch).toMatch(/preloadFloorEntryFont\(characters\)/)
    expect(batch).not.toMatch(/__twinGlyphPreload\?\.done/)
  })

  it('program cacheKey 按字段对比新增项', () => {
    const before = [{ name: 'standard', cacheKey: 'a,b,c' }]
    const after = [
      { name: 'standard', cacheKey: 'a,b,c' },
      { name: 'standard', cacheKey: 'a,x,c' },
    ]
    expect(diffProgramCacheKeys(before, after)).toEqual([{ name: 'standard', cacheKey: 'a,x,c', changed: ['1:b→x'] }])
  })

  it('createElement/getContext hook 只在 keepDrawingBuffer=1 或 probe=1 打开', () => {
    expect(glyphTimingProbeEnabled('')).toBe(false)
    expect(glyphTimingProbeEnabled('?q=perf')).toBe(false)
    expect(glyphTimingProbeEnabled('?keepDrawingBuffer=1')).toBe(true)
    expect(glyphTimingProbeEnabled('?q=perf&probe=1')).toBe(true)
  })

  it('pauseCounts 分别累加 pointer / motion / floor', () => {
    const root = globalThis as typeof globalThis & Window
    if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
      Object.defineProperty(globalThis, 'window', { value: root, configurable: true })
    }
    resetGlyphProbe()
    root.__twinView = 'building'
    root.__twinCameraMoveAt = undefined
    root.__twinSchedule = undefined
    setGlyphPointerDown(true)
    notePreloadPause()
    expect(root.__twinGlyphPreload?.pauseReason).toBe('pointer')
    expect(root.__twinGlyphPreload?.pauseCounts?.pointer).toBeGreaterThan(0)
    setGlyphPointerDown(false)
    root.__twinView = 'floor'
    notePreloadPause()
    expect(root.__twinGlyphPreload?.pauseReason).toBe('floor')
    expect(root.__twinGlyphPreload?.pauseCounts?.floor).toBeGreaterThan(0)
    root.__twinView = 'building'
    root.__twinCameraMoveAt = performance.now()
    notePreloadPause()
    expect(root.__twinGlyphPreload?.pauseReason).toBe('motion')
    expect(root.__twinGlyphPreload?.pauseCounts?.motion).toBeGreaterThan(0)
  })
})
