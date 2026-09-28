import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { listFloorSpecs } from '../data/floors'
import { BADGE_ALARM_X, BADGE_CHIP_W, BADGE_ID_X } from './badges'
import { BADGE_GLYPH_HEIGHT, buildBadgeDigitGeometry, glyphFrame, writeBadgeDigitPositions } from './badgeDigits'

describe('徽标数字图集', () => {
  it('数字比 B 窄，UV 落在图集给出的范围内', () => {
    const digit = glyphFrame('0')
    const letter = glyphFrame('B')
    expect(digit.width).toBeLessThan(BADGE_GLYPH_HEIGHT)
    expect(letter.width).toBeGreaterThan(digit.width)
    expect(digit.uv[0]).toBeGreaterThan(0.015)
    expect(digit.uv[2]).toBeLessThan(0.235)
    expect(digit.uv[1]).toBeCloseTo(0.765625, 5)
    expect(digit.uv[3]).toBeCloseTo(0.984375, 5)
  })

  it('两位数字放得进色块，楼层号用的字符都在图集里', () => {
    const pair = glyphFrame('8').width * 2
    expect(pair).toBeLessThan(BADGE_CHIP_W)
    const id = glyphFrame('F').width + glyphFrame('1').width + glyphFrame('2').width
    expect(BADGE_ID_X - id / 2).toBeGreaterThan(-4.5)
    for (const floor of listFloorSpecs()) {
      expect(() => [...floor.id].forEach((char) => glyphFrame(char))).not.toThrow()
    }
  })

  it('23 层合成一个索引网格，顶点按锚点平移', () => {
    const floors = listFloorSpecs().map((floor) => ({ ...floor, alarmCount: 6, offlineCount: 12 }))
    const { geometry, local, anchorIndex } = buildBadgeDigitGeometry(floors)
    const glyphs = floors.reduce(
      (sum, floor) => sum + floor.id.length + String(floor.alarmCount).length + String(floor.offlineCount).length,
      0,
    )
    expect(geometry.getAttribute('position').count).toBe(glyphs * 4)
    expect(geometry.getIndex()?.count).toBe(glyphs * 6)
    expect(geometry.groups).toHaveLength(0)
    expect(anchorIndex).toHaveLength(glyphs * 4)

    const positions = new Float32Array(local.length)
    const anchors = floors.map(() => ({ x: 0, y: 0, z: 0 }))
    anchors[1] = { x: 3, y: 4, z: 5 }
    writeBadgeDigitPositions(positions, local, anchorIndex, anchors, new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1))
    const vertex = anchorIndex.indexOf(1) * 3
    expect(positions[vertex]).toBeCloseTo(3 + local[vertex], 5)
    expect(positions[vertex + 1]).toBeCloseTo(4 + local[vertex + 1], 5)
    expect(positions[vertex + 2]).toBeCloseTo(5 + local[vertex + 2], 5)
    expect(local[2]).toBeGreaterThan(0)
    geometry.dispose()
  })

  it('告警数字以色块中心对齐', () => {
    const floors = [{ id: 'F1', alarmCount: 8, offlineCount: 0, elevation: 0, height: 6 }]
    const { geometry, local, anchorIndex } = buildBadgeDigitGeometry(floors)
    const centers: number[] = []
    for (let index = 0; index < anchorIndex.length; index += 4) {
      centers.push((local[index * 3] + local[(index + 1) * 3]) / 2)
    }
    const alarm = centers.find((x) => Math.abs(x - BADGE_ALARM_X) < 0.2)
    expect(alarm).toBeCloseTo(BADGE_ALARM_X, 4)
    geometry.dispose()
  })
})