import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { TROIKA_TEXT_CONFIG } from './disableTroikaCdn'
import { basementRoomLabels, ROOM_LABEL_FONT, roomLabelCharacters } from './roomLabels'

hydrateAllAboveGrade()

describe('房间引线标签', () => {
  it('单层标签用本地 woff 子集，不指向 otf 或外网，也不开 troika worker', () => {
    expect(ROOM_LABEL_FONT).toBe('/fonts/NotoSansSC-Regular-subset.woff')
    expect(ROOM_LABEL_FONT).not.toMatch(/\.otf|jsdelivr|cdn/i)
    expect(TROIKA_TEXT_CONFIG.useWorker).toBe(false)
    expect(TROIKA_TEXT_CONFIG.defaultFontURL).toBe(ROOM_LABEL_FONT)
  })

  it('图纸层标签放在 JSON 的 label 点上，地下室仍用原方案，总数不超过 30', () => {
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
