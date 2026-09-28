import { describe, expect, it } from 'vitest'
import { B1_COLOR_BLOCK_COUNT, buildB1ZoneGeometry } from './b1Zones'

describe('B1 色块合并', () => {
  it('10 个色块合成一个带顶点色、无分组的网格', () => {
    const geometry = buildB1ZoneGeometry()
    const color = geometry.getAttribute('color')
    const position = geometry.getAttribute('position')
    expect(color).toBeTruthy()
    expect(color.count).toBe(position.count)
    expect(color.itemSize).toBe(3)
    expect(geometry.groups).toHaveLength(0)
    expect(position.count).toBeGreaterThan(0)
    expect(B1_COLOR_BLOCK_COUNT).toBe(10)
    expect(B1_COLOR_BLOCK_COUNT - 1).toBeGreaterThanOrEqual(8)
    geometry.dispose()
  })
})
