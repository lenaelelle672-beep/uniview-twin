import { describe, expect, it } from 'vitest'
import { clearFloorCache, getFloorPlan } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { roomLabelCharacters } from '../stage/roomLabels'
import {
  collectDemoLabelCharacters,
  collectPrewarmCharacterChunks,
  collectPrewarmCharacters,
  DEMO_PREWARM_FLOORS,
  demoPrewarmPlansReady,
  uniqueCharacters,
} from './characters'

describe('D201 预热字形数量', () => {
  it('空闲未拉图纸时字形少于演示主线全量标签集', () => {
    clearFloorCache()
    const idleChars = collectPrewarmCharacters()
    const idleChunks = collectPrewarmCharacterChunks().join('')
    const idle = uniqueCharacters(idleChars)
    const idleFromChunks = uniqueCharacters(idleChunks)
    expect(demoPrewarmPlansReady()).toBe(false)
    expect(collectDemoLabelCharacters()).toBe('')

    for (const floorId of DEMO_PREWARM_FLOORS) hydrateFloorFromDisk(floorId)
    const required = uniqueCharacters(collectDemoLabelCharacters())
    expect(demoPrewarmPlansReady()).toBe(true)
    const afterPlans = uniqueCharacters(collectPrewarmCharacters())
    const afterChunks = uniqueCharacters(collectPrewarmCharacterChunks().join(''))
    const perFloor = Object.fromEntries(
      DEMO_PREWARM_FLOORS.map((floorId) => {
        const plan = getFloorPlan(floorId)!
        const labels = roomLabelsFromPlan(plan)
        return [
          floorId,
          {
            labels: labels.length,
            glyphs: uniqueCharacters(roomLabelCharacters(labels)).length,
          },
        ]
      }),
    )

    // 打印给 D201 回报，断言写在数字上以免静默漂。
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify(
        {
          idleGlyphs: idle.length,
          idleChunkGlyphs: idleFromChunks.length,
          requiredDemoLabelGlyphs: required.length,
          afterPlanCollect: afterPlans.length,
          afterPlanChunks: afterChunks.length,
          missingInIdle: [...required].filter((glyph) => !idle.includes(glyph)).length,
          perFloor,
        },
        null,
        2,
      ),
    )

    expect(idleFromChunks.length).toBe(idle.length)
    expect(required.length).toBeGreaterThan(idle.length)
    expect(afterChunks.length).toBeGreaterThanOrEqual(required.length)
    expect([...required].every((glyph) => afterChunks.includes(glyph))).toBe(true)
  })
})
