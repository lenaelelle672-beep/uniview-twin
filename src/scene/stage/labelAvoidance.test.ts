import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { displayName, roomLabelsFromPlan } from '../../floors/labels'
import { avoidLabels, clusterTemplates, labelScreenBox } from './labelAvoidance'

hydrateAllAboveGrade()

describe('房间标签避让', () => {
  it('不截断房间名，中文用 break-word 估算两行盒', () => {
    expect(displayName('采购部（88+1人）')).toBe('采购部（88+1人）')
    expect(displayName('一级主管办公室')).toBe('一级主管办公室')
    expect(displayName('会议室A1')).toBe('会议室A1')
    const box = labelScreenBox('采购部（88+1人）', 13)
    expect(box.h).toBeGreaterThan(13)
    expect(box.h).toBeLessThanOrEqual(13 * 1.2 * 2 + 8)
  })

  it('同名碰撞合并，拉开后拆回', () => {
    const stacked = [
      { id: 'a', text: '洽谈室', x: 100, y: 100, w: 72, h: 28, priority: 3, locked: false, area: 10 },
      { id: 'b', text: '洽谈室', x: 102, y: 101, w: 72, h: 28, priority: 3, locked: false, area: 10 },
      { id: 'c', text: '洽谈室', x: 101, y: 99, w: 72, h: 28, priority: 3, locked: false, area: 10 },
      { id: 'd', text: '洽谈室', x: 103, y: 100, w: 72, h: 28, priority: 3, locked: false, area: 10 },
    ]
    const merged = avoidLabels(stacked)
    expect(merged.clusters).toHaveLength(1)
    expect(merged.clusters[0]?.text).toBe('洽谈室 ×4')
    expect(merged.placements.every((row) => row.cluster === '洽谈室')).toBe(true)
    expect(merged.overlapPairs).toBe(0)

    const spread = stacked.map((item, index) => ({ ...item, x: 80 + index * 80 }))
    const split = avoidLabels(spread)
    expect(split.clusters).toHaveLength(0)
    expect(split.placements.every((row) => row.visible)).toBe(true)
    expect(split.overlapPairs).toBe(0)
  })

  it('告警/选中永不隐藏，其余可偏移或隐藏', () => {
    const items = [
      { id: 'alarm', text: '打印', x: 200, y: 200, w: 72, h: 28, priority: 0, locked: true, area: 8 },
      { id: 'other', text: '文档室', x: 202, y: 201, w: 72, h: 28, priority: 3, locked: false, area: 8 },
    ]
    const result = avoidLabels(items)
    expect(result.placements.find((row) => row.id === 'alarm')?.visible).toBe(true)
    expect(result.placements.find((row) => row.id === 'other')?.visible).toBe(false)
  })

  it('F12 图纸层会预生成洽谈室/会议室组标签', () => {
    const labels = roomLabelsFromPlan(getFloorPlan('F12')!)
    expect(labels.some((label) => label.text === '采购部（88+1人）')).toBe(true)
    const clusters = clusterTemplates(labels)
    expect(clusters.some((item) => item.text.startsWith('洽谈室 ×'))).toBe(true)
    expect(clusters.some((item) => item.text.startsWith('会议室 ×'))).toBe(true)
  })
})
