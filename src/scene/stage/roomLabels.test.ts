import { describe, expect, it } from 'vitest'
import { basementRoomLabels, ROOM_LABEL_FONT, roomLabelCharacters, towerRoomLabels } from './roomLabels'

describe('房间引线标签', () => {
  it('单层标签用本地 woff 子集，不指向 otf 或外网', () => {
    expect(ROOM_LABEL_FONT).toBe('/fonts/NotoSansSC-Regular-subset.woff')
    expect(ROOM_LABEL_FONT).not.toMatch(/\.otf|jsdelivr|cdn/i)
  })

  it('标准层包含会议室、茶水间、前台、电梯厅，总数不超过 30', () => {
    const labels = towerRoomLabels()
    const basement = basementRoomLabels()
    expect(labels.length + basement.length).toBeLessThanOrEqual(30)
    const text = labels.map((label) => label.text).join(' ')
    expect(text).toContain('会议室')
    expect(text).toContain('茶水间')
    expect(text).toContain('前台')
    expect(text).toContain('电梯厅')
    expect(labels.filter((label) => label.text.startsWith('会议室'))).toHaveLength(3)
    for (const label of [...labels, ...basement]) {
      expect(label.anchor).toHaveLength(3)
      expect(label.label).toHaveLength(3)
      expect(label.label[1]).toBeGreaterThan(label.anchor[1])
    }
    const characters = roomLabelCharacters(labels)
    expect(characters).toContain('会')
    expect(characters).not.toMatch(/\s/)
  })
})
