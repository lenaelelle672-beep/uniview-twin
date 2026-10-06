import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { displayName, roomLabelsFromPlan } from '../../floors/labels'
import {
  LABEL_MAX_OFFSET,
  avoidLabels,
  clusterLabelText,
  clusterTemplates,
  labelScreenBox,
  zoomAvoidItems,
} from './labelAvoidance'

hydrateAllAboveGrade()

function planItems(floorId: string, width = 1366, height = 768) {
  const labels = roomLabelsFromPlan(getFloorPlan(floorId)!)
  const xs = labels.map((label) => label.label[0])
  const zs = labels.map((label) => label.label[2])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const pad = 48
  return labels.map((label) => {
    const box = labelScreenBox(label.text, 14)
    return {
      id: label.id,
      text: label.text,
      x: pad + ((label.label[0] - minX) / (maxX - minX || 1)) * (width - pad * 2),
      y: pad + ((label.label[2] - minZ) / (maxZ - minZ || 1)) * (height - pad * 2),
      w: box.w,
      h: box.h,
      priority: 3,
      locked: false,
      area: label.area ?? 0,
    }
  })
}

describe('房间标签避让', () => {
  it('不截断房间名，中文用 break-word 估算两行盒', () => {
    expect(displayName('采购部（88+1人）')).toBe('采购部')
    expect(displayName('一级主管办公室')).toBe('一级主管办公室')
    expect(displayName('会议室A1')).toBe('会议室A1')
    const box = labelScreenBox('丙类公共事务部礼品房', 13)
    expect(box.h).toBeGreaterThan(13)
    expect(box.h).toBeLessThanOrEqual(13 * 1.2 * 2 + 16)
  })

  it('同名先合并，拉开后拆回，合组用 ASCII x', () => {
    const stacked = [
      { id: 'a', text: '洽谈室', x: 100, y: 100, w: 72, h: 28, priority: 3, locked: false, area: 10 },
      { id: 'b', text: '洽谈室', x: 102, y: 101, w: 72, h: 28, priority: 3, locked: false, area: 10 },
      { id: 'c', text: '洽谈室', x: 101, y: 99, w: 72, h: 28, priority: 3, locked: false, area: 10 },
      { id: 'd', text: '洽谈室', x: 103, y: 100, w: 72, h: 28, priority: 3, locked: false, area: 10 },
    ]
    const merged = avoidLabels(stacked)
    expect(merged.clusters).toHaveLength(1)
    expect(merged.clusters[0]?.text).toBe('洽谈室 x4')
    expect(clusterLabelText('洽谈室', 4)).toBe('洽谈室 x4')
    expect(merged.placements.every((row) => row.cluster === '洽谈室')).toBe(true)
    expect(merged.merged).toBe(4)
    expect(merged.hiddenAfterZoom).toBe(0)

    const spread = stacked.map((item, index) => ({ ...item, x: 80 + index * 80 }))
    const split = avoidLabels(spread)
    expect(split.clusters).toHaveLength(0)
    expect(split.placements.every((row) => row.visible)).toBe(true)
    expect(split.hidden).toBe(0)
    expect(split.hiddenAfterZoom).toBe(0)
  })

  it('告警/选中永不隐藏，挤满后其余才隐藏', () => {
    const crowd = Array.from({ length: 48 }, (_, index) => ({
      id: `n${index}`,
      text: `房间${index}`,
      x: 200,
      y: 200,
      w: 80,
      h: 32,
      priority: 3,
      locked: false,
      area: 8,
    }))
    const items = [
      { id: 'alarm', text: '打印', x: 200, y: 200, w: 80, h: 32, priority: 0, locked: true, area: 8 },
      ...crowd,
    ]
    const result = avoidLabels(items)
    expect(result.placements.find((row) => row.id === 'alarm')?.visible).toBe(true)
    expect(result.hidden).toBeGreaterThan(0)
    expect(result.hiddenAfterZoom).toBe(0)
    expect(zoomAvoidItems(items)).toHaveLength(items.length)
  })

  it('F12 图纸层会预生成洽谈室/会议室组标签', () => {
    const labels = roomLabelsFromPlan(getFloorPlan('F12')!)
    expect(labels.some((label) => label.text === '采购部')).toBe(true)
    const clusters = clusterTemplates(labels)
    expect(clusters.some((item) => item.text.startsWith('洽谈室 x'))).toBe(true)
    expect(clusters.some((item) => item.text.startsWith('会议室 x'))).toBe(true)
  })

  it('F1–F8 / F12 / F22 在 1024/1366/1920 拉近后 hiddenAfterZoom 为 0，重叠为 0，挪位 ≤48', () => {
    expect(LABEL_MAX_OFFSET).toBe(48)
    for (const width of [1024, 1366, 1920]) {
      for (const floorId of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F12', 'F22']) {
        const result = avoidLabels(planItems(floorId, width))
        expect(result.hiddenAfterZoom, `${floorId}@${width}`).toBe(0)
        expect(result.overlapPairs, `${floorId}@${width}`).toBe(0)
        expect(result.maxOffset, `${floorId}@${width}`).toBeLessThanOrEqual(LABEL_MAX_OFFSET)
        for (const row of result.placements) {
          if (!row.visible) continue
          expect(Math.hypot(row.offsetX, row.offsetY), row.id).toBeLessThanOrEqual(LABEL_MAX_OFFSET)
        }
        for (const cluster of result.clusters) {
          expect(Math.hypot(cluster.offsetX, cluster.offsetY), cluster.key).toBeLessThanOrEqual(LABEL_MAX_OFFSET)
        }
      }
    }
  })

  it('可见标签挪位不超过 48 px，48 内放不下就隐藏', () => {
    const crowd = Array.from({ length: 20 }, (_, index) => ({
      id: `n${index}`,
      text: `房间${index}`,
      x: 200,
      y: 200,
      w: 80,
      h: 32,
      priority: 3,
      locked: false,
      area: 8,
    }))
    const result = avoidLabels(crowd)
    expect(result.maxOffset).toBeLessThanOrEqual(48)
    expect(result.hidden).toBeGreaterThan(0)
    expect(result.overlapPairs).toBe(0)
    expect(result.hiddenAfterZoom).toBe(0)
    expect(result.placements.filter((row) => row.visible).every((row) => Math.hypot(row.offsetX, row.offsetY) <= 48)).toBe(true)
  })

  it('F03 客户休息室与最近外廊世界距离约 27.4 m，合组只用重叠的那一撮', () => {
    const labels = roomLabelsFromPlan(getFloorPlan('F3')!)
    const rest = labels.find((label) => label.text === '客户休息室')
    const corridors = labels.filter((label) => label.text === '外廊')
    expect(rest).toBeTruthy()
    expect(corridors).toHaveLength(4)
    const dists = corridors.map((label) => Math.hypot(label.label[0] - rest!.label[0], label.label[2] - rest!.label[2]))
    const nearest = Math.min(...dists)
    expect(nearest).toBeCloseTo(27.4, 1)
    const packed = avoidLabels(planItems('F3'))
    expect(packed.overlapPairs).toBe(0)
    const restPlace = packed.placements.find((row) => row.id === rest!.id)
    expect(restPlace).toBeTruthy()
    if (restPlace?.cluster) expect(restPlace.cluster).not.toBe('外廊')
  })

  it('同名远离的房间不把组标签放到全体质心', () => {
    const items = [
      { id: 'a', text: '外廊', x: 80, y: 80, w: 40, h: 20, priority: 3, locked: false, area: 10 },
      { id: 'b', text: '外廊', x: 90, y: 82, w: 40, h: 20, priority: 3, locked: false, area: 10 },
      { id: 'c', text: '外廊', x: 700, y: 400, w: 40, h: 20, priority: 3, locked: false, area: 10 },
      { id: 'd', text: '外廊', x: 900, y: 80, w: 40, h: 20, priority: 3, locked: false, area: 10 },
    ]
    const packed = avoidLabels(items)
    expect(packed.clusters).toHaveLength(1)
    expect(packed.clusters[0]?.ids).toEqual(['a', 'b'])
    expect(packed.clusters[0]?.x).toBeGreaterThan(60)
    expect(packed.clusters[0]?.x).toBeLessThan(160)
    expect(packed.overlapPairs).toBe(0)
  })
})
