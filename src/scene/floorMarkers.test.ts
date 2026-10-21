import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { floorSpec } from '../data/floors'
import { courtyardHole } from './massing'
import { floorMarkerMidY, floorMarkerOutline, floorMarkerWorldPoints } from './floorMarkerAnchors'
import { overviewFloorIds, overviewFloorRows, stripFloorRows, writeFloorMarkerProbe } from './floorMarkers'
import { TOWER_OUTLINE_OVERVIEW } from './shell/rings'
import { b1SlabOutline, basementPickOutline } from './stage/b1Plan'

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
    expect(source).toMatch(/view === 'building' && open/)
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.floor-rail \{[\s\S]*width:\s*232px/)
    expect(css).toMatch(/\.floor-panel \{[\s\S]*position:\s*absolute/)
    expect(css).toMatch(/\.workspace \{[\s\S]*position:\s*relative/)
    const shell = readFileSync(new URL('../components/UIShell.tsx', import.meta.url), 'utf8')
    expect(shell).toMatch(/floor-rail/)
    expect(source).toMatch(/setSelectedFloor\(floor\.id\)/)
    expect(source).toMatch(/onDoubleClick/)
    expect(source).toMatch(/enterFloor\(floor\.id\)/)
  })

  it('楼层引线在相机未停、回程滑行或爆炸途中续帧', () => {
    const source = readFileSync(new URL('../components/FloorLeader.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/__twinCameraRested === false/)
    expect(source).toMatch(/__twinRig\?\.active/)
    expect(source).not.toMatch(/from ['"][^'"]*cameraRest/)
    expect(source).toMatch(/pointerdown/)
    expect(source).toMatch(/wheel/)
    expect(source).not.toMatch(/frame = requestAnimationFrame\(tick\)\s+const svg/)
    const types = readFileSync(new URL('../vite-env.d.ts', import.meta.url), 'utf8')
    expect(types).toMatch(/__twinRig\?: \{[\s\S]*?active\?: boolean/)
  })

  it('B1 锚点用下沉广场开口，地下层不加层中高度', () => {
    const anchors = readFileSync(new URL('./floorMarkerAnchors.ts', import.meta.url), 'utf8')
    expect(anchors).toMatch(/basementPickOutline/)
    expect(anchors).not.toMatch(/b1SlabOutline/)
    expect(anchors).toMatch(/spec\.level < 0\) return offset/)

    const root = globalThis as unknown as { window?: Window }
    const had = Object.prototype.hasOwnProperty.call(root, 'window')
    const previous = root.window
    const win = {} as Window
    root.window = win
    try {
      expect(floorMarkerOutline('B1')).toEqual(basementPickOutline())
      expect(floorMarkerOutline('B1')).toEqual(courtyardHole())
      expect(floorMarkerOutline('B1')).not.toEqual(b1SlabOutline())
      expect(floorMarkerOutline('F1')).toBe(TOWER_OUTLINE_OVERVIEW)
      expect(floorMarkerMidY('B1')).toBe(0)
      const above = floorSpec('F1')
      expect(floorMarkerMidY('F1')).toBeCloseTo(above.elevation + above.height / 2, 5)
      win.__twinExplode = {
        progress: 1,
        exploded: true,
        gap: 8,
        overlap: false,
        floors: [
          { id: 'B1', offset: 3, groupY: null, bottom: -5.5, top: 0 },
          { id: 'F1', offset: 3, groupY: null, bottom: 0, top: above.height },
        ],
      }
      expect(floorMarkerMidY('B1')).toBe(3)
      expect(floorMarkerMidY('F1')).toBeCloseTo(above.elevation + above.height / 2 + 3, 5)
      const points = floorMarkerWorldPoints('B1')
      expect(points.slice(3).map(([x, , z]) => [x, z])).toEqual(courtyardHole())
      expect(points.every(([, y]) => y === 3)).toBe(true)
    } finally {
      if (had) root.window = previous
      else delete root.window
    }
  })
})
