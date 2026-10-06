import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { ROOM_LABEL_FONT, roomLabelCharacters } from '../stage/roomLabels'
import {
  collectPrewarmCharacterChunks,
  collectPrewarmCharacters,
  DEMO_PREWARM_FLOORS,
  DEMO_ROOM_LABEL_TEXTS,
  GLYPH_PREWARM_CHUNK,
  uniqueCharacters,
} from './characters'
import { textRuntimePrefetchDone, woffAlreadyRequested } from './fontPrewarm'
import { SHADER_PREWARM_ENABLED } from './shaderPrewarmFlag'
import { FLOOR_SHADER_GROUPS } from './shaderGroups'

const here = dirname(fileURLToPath(import.meta.url))

function read(rel: string) {
  return readFileSync(join(here, rel), 'utf8')
}

describe('T017 进层预热', () => {
  it('演示主线楼层顺序是 F12 → F22 → F18 → F3 → F1', () => {
    expect([...DEMO_PREWARM_FLOORS]).toEqual(['F12', 'F22', 'F18', 'F3', 'F1'])
  })

  it('字形覆盖房间名、楼层名、告警文案，且含 RoomLabels 的洽丙嗆', () => {
    for (const floorId of DEMO_PREWARM_FLOORS) hydrateFloorFromDisk(floorId)
    const chars = collectPrewarmCharacters()
    expect(chars).toMatch(/洽/)
    expect(chars).toMatch(/丙/)
    expect(chars).toMatch(/嗆/)
    expect(chars).toMatch(/电梯厅|会议|茶水/)
    expect(chars).toMatch(/一层|地下/)
    expect(chars).toMatch(/告警|打印/)
    expect(chars).not.toMatch(/\s/)
    const live = roomLabelCharacters(DEMO_PREWARM_FLOORS.flatMap((id) => roomLabelsFromPlan(getFloorPlan(id)!)))
    for (const glyph of live) {
      expect(chars).toContain(glyph)
    }
    expect(DEMO_ROOM_LABEL_TEXTS.join('')).toMatch(/洽谈室/)
    expect(uniqueCharacters('aabb 一层')).toBe('ab一层')
  })

  it('字体 URL 与 RoomLabels / BatchedRoomLabels 一致', () => {
    expect(ROOM_LABEL_FONT).toBe('/fonts/NotoSansSC-Regular-subset.woff')
    const batched = read('../stage/BatchedRoomLabels.tsx')
    const font = read('./fontPrewarm.ts')
    expect(batched).toMatch(/preloadFont\(\{ font: ROOM_LABEL_FONT, characters \}/)
    expect(font).toMatch(/preloadFont\(\{ font: ROOM_LABEL_FONT, characters \}/)
    expect(font).toMatch(/waitTextRuntimePrefetch|textRuntimePrefetchDone/)
    expect(font).toMatch(/NotoSansSC-Regular-subset/)
    const idle = read('./IdlePrewarm.tsx')
    expect(idle).toMatch(/collectPrewarmCharacterChunks/)
    expect(idle).toMatch(/preloadLabelFont\(chunk\)/)
    expect(idle).toMatch(/loadFloorPlan/)
    expect(idle).toMatch(/DEMO_PREWARM_FLOORS/)
    expect(idle).toMatch(/glyphsComplete/)
    expect(idle).toMatch(/if \(!glyphsComplete\) return/)
    expect(idle).not.toMatch(/void run\(\)\.catch\(\(\) => \{[\s\S]*markDone/)
    expect(GLYPH_PREWARM_CHUNK).toBeLessThanOrEqual(8)
    const chunks = collectPrewarmCharacterChunks()
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.length <= GLYPH_PREWARM_CHUNK)).toBe(true)
    expect(chunks.join('')).toMatch(/电梯|会议|茶水/)
  })

  it('每组只编译一个 program / 一组材质，覆盖楼层共用材质', () => {
    const ids = FLOOR_SHADER_GROUPS.map((group) => group.id)
    expect(ids).toContain('slab-standard-receive')
    expect(ids).toContain('instanced-standard-shadow')
    expect(ids).toContain('instanced-physical-glass')
    expect(ids).toContain('instanced-monitor-basic')
    expect(ids).toContain('ceiling-standard')
    expect(ids).toContain('room-label-line')
    expect(new Set(ids).size).toBe(ids.length)
    const compile = read('./compileGroup.ts')
    expect(compile).toMatch(/compileMaterialGroup/)
    expect(compile).toMatch(/compileAsync\(host, camera, liveScene\)|compile\(host, camera, liveScene\)/)
    expect(compile).toMatch(/__twinComposerInput/)
    expect(compile).toMatch(/setRenderTarget/)
    expect(compile).not.toMatch(/compileAsync\(liveScene/)
    expect(compile).toMatch(/supportsParallelShaderCompile/)
    const flag = read('./shaderPrewarmFlag.ts')
    expect(flag).toMatch(/SHADER_PREWARM_ENABLED/)
    expect(SHADER_PREWARM_ENABLED).toBe(false)
    const idle = read('./IdlePrewarm.tsx')
    expect(idle).toMatch(/SHADER_PREWARM_ENABLED/)
    expect(idle).toMatch(/import\('\.\/compileGroup'\)/)
    expect(read('../../components/scene/RenderProbe.tsx')).not.toMatch(/compileGroup/)
    const extra = read('./extraPrewarm.ts')
    expect(extra).toMatch(/preloadFont|compileTroikaSample/)
    expect(extra).toMatch(/man-in-suit/)
  })

  it('入口只挂门闩，首帧前不拉 troika / woff / 图纸', () => {
    const scene = read('../../components/Scene.tsx')
    const gate = read('./PrewarmGate.tsx')
    const idle = read('./IdlePrewarm.tsx')
    const yieldSrc = read('./idleYield.ts')
    expect(scene).toMatch(/<PrewarmGate/)
    expect(scene).toMatch(/import\(['"]\.\.\/scene\/prewarm\/PrewarmGate['"]\)/)
    expect(scene).toMatch(/prefetchDone &&/)
    expect(scene).toMatch(/__twinFirstPrefetchDone/)
    expect(scene).not.toMatch(/troika-three-text/)
    expect(scene).not.toMatch(/preloadFont/)
    expect(scene).not.toMatch(/compileAsync/)
    expect(scene).not.toMatch(/NotoSansSC/)
    expect(gate).toMatch(/__twinReady === true && window\.__twinFirstFrameAt/)
    expect(gate).toMatch(/waitFirstPrefetch/)
    expect(gate).toMatch(/import\('\.\/IdlePrewarm'\)/)
    expect(gate).not.toMatch(/troika-three-text/)
    const prefetch = read('../stage/prefetchLazyChunks.ts')
    expect(prefetch).toMatch(/import\('\.\/textRuntime'\)\.then/)
    expect(prefetch).toMatch(/markFirstPrefetchDone|__twinFirstPrefetchDone/)
    expect(prefetch).toMatch(/import\('\.\.\/labels\/ProgressiveRoomLabels'\)/)
    expect(prefetch).not.toMatch(/setTimeout|setInterval/)
    const textRuntime = read('../stage/textRuntime.tsx')
    expect(textRuntime).not.toMatch(/ProgressiveRoomLabels|labels\/Progressive/)
    const roomLabels = read('../stage/RoomLabels.tsx')
    expect(roomLabels).toMatch(/waitFirstPrefetch/)
    expect(roomLabels).toMatch(/import\('\.\.\/labels\/ProgressiveRoomLabels'\)/)
    expect(idle).toMatch(/waitTextRuntimePrefetch|textRuntimePrefetchDone/)
    expect(idle).toMatch(/pointerdown|createYieldController/)
    expect(idle).toMatch(/FLOOR_SHADER_GROUPS|SHADER_PREWARM_ENABLED/)
    expect(idle).toMatch(/__twinPrewarmed/)
    expect(idle).toMatch(/collectPrewarmCharacterChunks/)
    expect(yieldSrc).toMatch(/pointerdown/)
    expect(yieldSrc).toMatch(/keydown/)
    expect(yieldSrc).toMatch(/requestIdleCallback/)
    expect(yieldSrc).toMatch(/setTimeout/)
    expect(yieldSrc).toMatch(/FloorInterior/)
  })

  it('textRuntime 完成判定看 Resource Timing，不误判 woff', () => {
    expect(textRuntimePrefetchDone()).toBe(false)
    expect(woffAlreadyRequested()).toBe(false)
  })
})
