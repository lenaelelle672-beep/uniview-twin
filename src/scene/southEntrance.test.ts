import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EAST_CANTILEVER_M, EAST_CANTILEVER_SOFFIT_T_M, eastLowerOutline, eastUpperOutline } from './massing'
import {
  SOUTH_CANOPY_DEPTH_M,
  SOUTH_CANOPY_T_M,
  SOUTH_ENTRANCE_STEP_COUNT,
  SOUTH_ENTRANCE_STEP_RISE_M,
  buildSouthEntranceStoneGeometry,
  southCanopySoffitStripXs,
  southEntranceLayout,
} from './southEntrance'

const here = dirname(fileURLToPath(import.meta.url))

describe('T139 南入口雨棚', () => {
  it('不改已合悬挑常数，雨棚从下层南墙伸出并越过上层南缘', () => {
    expect(EAST_CANTILEVER_M).toBe(4)
    expect(EAST_CANTILEVER_SOFFIT_T_M).toBe(0.7)
    const layout = southEntranceLayout()
    const lowerSouth = Math.max(...eastLowerOutline().map(([, z]) => z))
    const upperSouth = Math.max(...eastUpperOutline().map(([, z]) => z))
    expect(layout.lowerSouthZ).toBeCloseTo(lowerSouth, 5)
    expect(layout.upperSouthZ).toBeCloseTo(upperSouth, 5)
    expect(layout.canopyNorthZ).toBeCloseTo(lowerSouth, 5)
    expect(layout.canopySouthZ).toBeCloseTo(lowerSouth + SOUTH_CANOPY_DEPTH_M, 5)
    expect(layout.canopySouthZ).toBeGreaterThan(upperSouth + 5)
    expect(SOUTH_CANOPY_T_M).toBeGreaterThanOrEqual(0.7)
    expect(layout.canopyTopY - layout.soffitY).toBeCloseTo(SOUTH_CANOPY_T_M, 5)
    expect(layout.canopyWestX).toBeGreaterThan(layout.lowerWestX)
    expect(layout.canopyEastX).toBeLessThan(layout.lowerEastX)
    expect(layout.canopyEastX - layout.canopyWestX).toBeGreaterThan(20)
    expect(layout.midSouthZ).toBeCloseTo(upperSouth, 5)
    expect(layout.midTopY).toBeLessThan(19.6)
  })

  it('吊顶线脚用一条 InstancedMesh 布置，台阶为三跑浅踏', () => {
    const layout = southEntranceLayout()
    const xs = southCanopySoffitStripXs(layout)
    expect(xs.length).toBeGreaterThanOrEqual(20)
    expect(xs[0]).toBeGreaterThan(layout.canopyWestX)
    expect(xs[xs.length - 1]).toBeLessThan(layout.canopyEastX)
    expect(layout.steps).toHaveLength(SOUTH_ENTRANCE_STEP_COUNT)
    expect(SOUTH_ENTRANCE_STEP_RISE_M).toBeLessThanOrEqual(0.16)
    const top = layout.steps[0]
    const front = layout.steps[layout.steps.length - 1]
    expect(top.z0).toBeLessThan(layout.canopySouthZ)
    expect(front.z1).toBeGreaterThan(layout.canopySouthZ)
    expect(top.y1).toBeGreaterThan(front.y1)
    expect(layout.steps[0].y1 - layout.steps[1].y1).toBeCloseTo(SOUTH_ENTRANCE_STEP_RISE_M, 5)
    expect(layout.steps[1].y1 - layout.steps[2].y1).toBeCloseTo(SOUTH_ENTRANCE_STEP_RISE_M, 5)
  })

  it('合并后的石材几何包住雨棚、墙墩和台阶', () => {
    const layout = southEntranceLayout()
    const geometry = buildSouthEntranceStoneGeometry(layout)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    expect(box).not.toBeNull()
    if (!box) return
    expect(box.min.x).toBeCloseTo(layout.canopyWestX, 3)
    expect(box.max.x).toBeCloseTo(layout.canopyEastX, 3)
    expect(box.max.z).toBeCloseTo(layout.steps[layout.steps.length - 1].z1, 3)
    expect(box.min.z).toBeCloseTo(layout.canopyNorthZ, 3)
    expect(box.max.y).toBeGreaterThan(layout.canopyTopY)
    expect(box.max.y).toBeCloseTo(layout.midTopY, 3)
    expect(box.min.y).toBeGreaterThan(-1e-5)
    geometry.dispose()
  })

  it('东楼等 __twinReady、首帧 +2600ms 才 import 南入口，躲开 hardGate', () => {
    const east = readFileSync(join(here, '../components/scene/EastBlock.tsx'), 'utf8')
    expect(east).toMatch(/SOUTH_ENTRANCE_AFTER_FIRST_MS = 2600/)
    expect(east).toMatch(/__twinReady === true/)
    expect(east).toMatch(/__twinFirstFrameAt/)
    expect(east).toMatch(/performance\.now\(\) - first >= SOUTH_ENTRANCE_AFTER_FIRST_MS/)
    expect(east).toMatch(/lazy\(\(\) => import\('\.\/SouthEntrance'\)\)/)
    expect(east).toMatch(/<LateSouthEntrance model=\{model\} \/>/)
    expect(east).not.toMatch(/from '\.\/SouthEntrance'/)
    expect(east).not.toMatch(/const southEntranceImport = import\(/)
  })
})
