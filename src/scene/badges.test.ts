import { describe, expect, it } from 'vitest'
import { listFloorSpecs } from '../data/floors'
import { BADGE_HEIGHT, badgeAnchor, badgeBoxesOverlap } from './badges'

describe('楼层徽标位置', () => {
  it('23 个徽标两两不重叠，B1 与 F1～F22 都在', () => {
    const anchors = listFloorSpecs().map((floor) => badgeAnchor(floor))
    expect(anchors).toHaveLength(23)
    expect(anchors.map((item) => item.id)).toEqual(['B1', ...Array.from({ length: 22 }, (_, index) => `F${index + 1}`)])
    for (let i = 0; i < anchors.length; i += 1) {
      for (let j = i + 1; j < anchors.length; j += 1) {
        expect(badgeBoxesOverlap(anchors[i], anchors[j])).toBe(false)
      }
    }
  })

  it('地上层徽标落在该层高度范围内', () => {
    for (const floor of listFloorSpecs()) {
      if (floor.id === 'B1') continue
      const anchor = badgeAnchor(floor)
      expect(anchor.y).toBeGreaterThanOrEqual(floor.elevation)
      expect(anchor.y).toBeLessThanOrEqual(floor.elevation + floor.height)
      expect(anchor.y - BADGE_HEIGHT / 2).toBeGreaterThan(0)
    }
  })
})
