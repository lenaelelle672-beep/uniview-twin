import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { basementRoomLabels, roomLabelCharacters } from './roomLabels'

hydrateAllAboveGrade()

describe('房间引线标签', () => {
  it('图纸层标签放在 label 点上，地下室仍用原方案，总数不超过 30', () => {
    const labels = roomLabelsFromPlan(getFloorPlan('F12')!)
    const basement = basementRoomLabels()
    expect(labels.length + basement.length).toBeLessThanOrEqual(30)
    const text = labels.map((label) => label.text).join(' ')
    expect(text).toMatch(/会议|茶水|电梯/)
    for (const label of [...labels, ...basement]) {
      expect(label.anchor).toHaveLength(3)
      expect(label.label).toHaveLength(3)
      expect(label.label[1]).toBeGreaterThan(label.anchor[1])
    }
    const characters = roomLabelCharacters(labels)
    expect(characters.length).toBeGreaterThan(0)
    expect(characters).not.toMatch(/\s/)
  })
})
