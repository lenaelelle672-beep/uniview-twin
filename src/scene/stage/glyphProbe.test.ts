import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { clusterTemplates } from './labelAvoidance'
import { roomLabelCharacters } from './roomLabels'
import { GLYPH_BATCH, GLYPH_FIRST_BATCH, GLYPH_MS_PER, chunkGlyphs, takeGlyphBudget } from './glyphProbe'
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
    expect(preload).toMatch(/glyphPreloadBlocked/)
    expect(preload).toMatch(/window\.__twinFirstFrameAt == null/)
    const probe = readFileSync(new URL('./glyphProbe.ts', import.meta.url), 'utf8')
    expect(probe).toMatch(/Increasing SDF texture size/)
    expect(probe).toMatch(/GLYPH_BATCH = 60/)
    expect(probe).toMatch(/GLYPH_FIRST_BATCH = 4/)
    expect(probe).toMatch(/pointerdown/)
    expect(probe).toMatch(/__twinCameraRested/)
  })
})
