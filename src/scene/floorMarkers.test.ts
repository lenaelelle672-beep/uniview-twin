import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { overviewFloorIds, overviewFloorRows, stripFloorRows, writeFloorMarkerProbe } from './floorMarkers'

describe('总览楼层标记', () => {
  it('23 层顺序为 F22…F1、B1', () => {
    const ids = overviewFloorIds()
    expect(ids).toHaveLength(23)
    expect(ids[0]).toBe('F22')
    expect(ids[21]).toBe('F1')
    expect(ids[22]).toBe('B1')
    expect(overviewFloorRows()).toHaveLength(23)
  })

  it('窄条只保留有告警或离线的楼层', () => {
    const rows = overviewFloorRows([
      { id: 'F12', alarmCount: 8, offlineCount: 0 },
      { id: 'F1', alarmCount: 0, offlineCount: 2 },
      { id: 'F2', alarmCount: 0, offlineCount: 0 },
    ])
    expect(stripFloorRows(rows).map((row) => row.id)).toEqual(['F12', 'F1'])
  })

  it('首帧前写出 23 个楼层标记探针', () => {
    const root = globalThis as typeof globalThis & Window
    delete root.__twinFirstFrameAt
    delete root.__twinFloorMarkers
    const probe = writeFloorMarkerProbe(23, 12)
    expect(probe).toEqual({ count: 23, renderedBeforeFirstFrame: true, at: 12 })
    root.__twinFirstFrameAt = 100
    expect(writeFloorMarkerProbe(23, 200).renderedBeforeFirstFrame).toBe(true)
  })

  it('Scene 不再挂 3D 徽标，也不再加载徽标 png', () => {
    const scene = readFileSync(new URL('../components/Scene.tsx', import.meta.url), 'utf8')
    expect(scene).not.toMatch(/FloorBadges/)
    expect(scene).not.toMatch(/Hud/)
    expect(scene).not.toMatch(/badge-digits/)
  })

  it('FloorList 在 layout 阶段写 __twinFloorMarkers', () => {
    const source = readFileSync(new URL('../components/FloorList.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/writeFloorMarkerProbe/)
    expect(source).toMatch(/data-twin-floor-marker/)
    expect(source).toMatch(/is-overview-compact/)
    expect(source).toMatch(/is-strip/)
    expect(source).toMatch(/setSelectedFloor\(floor\.id\)/)
    expect(source).toMatch(/onDoubleClick/)
    expect(source).toMatch(/enterFloor\(floor\.id\)/)
  })
})
