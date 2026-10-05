import { describe, expect, it } from 'vitest'
import { floorDeskCount } from '../../floors/deskCounts'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { createMockData } from '../../data/mockData'
import { deviceBadges, STATUS_GLYPH } from './badges'
import { workstationPosition } from './workstationPosition'

hydrateAllAboveGrade()

describe('设备圆标', () => {
  it('位置来自 workstationPosition，四种形状都有', () => {
    const data = createMockData()
    const badges = deviceBadges('F12', data.devices)
    expect(badges.length).toBe(floorDeskCount('F12'))
    const shapes = new Set<string>()
    for (const badge of badges) {
      const position = workstationPosition('F12', badge.deskId)
      expect(badge.x).toBe(position.x)
      expect(badge.z).toBe(position.z)
      expect(badge.y).toBeGreaterThan(1.4)
      expect(badge.shape).toBe(STATUS_GLYPH[badge.status].shape)
      shapes.add(badge.shape)
    }
    expect(shapes).toEqual(new Set(['circle', 'square', 'triangle', 'cross']))
    expect(new Set(Object.values(STATUS_GLYPH).map((glyph) => glyph.index)).size).toBe(4)
  })

  it('不给没有工位号的设备另造坐标', () => {
    const data = createMockData()
    const badges = deviceBadges('F3', data.devices)
    expect(badges.every((badge) => badge.deskId.startsWith('F3-'))).toBe(true)
    expect(badges.some((badge) => badge.deskId.includes('PR') || badge.deskId.includes('CAM'))).toBe(false)
  })
})
