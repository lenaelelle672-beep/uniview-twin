import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { roomLabelsFromPlan } from '../../floors/labels'
import { TROIKA_TEXT_CONFIG } from './disableTroikaCdn'
import {
  basementRoomLabels,
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  ROOM_LABEL_COLOR,
  ROOM_LABEL_FONT,
  ROOM_LABEL_OUTLINE_COLOR,
  ROOM_LABEL_OUTLINE_EM,
  labelFadeForTarget,
  roomLabelCharacters,
  roomLabelOutlineWidth,
  worldFontSizeForDistance,
} from './roomLabels'

hydrateAllAboveGrade()

describe('房间引线标签', () => {
  it('单层标签用本地 woff 子集，不指向 otf 或外网，也不开 troika worker', () => {
    expect(ROOM_LABEL_FONT).toBe('/fonts/NotoSansSC-Regular-subset.woff')
    expect(ROOM_LABEL_FONT).not.toMatch(/\.otf|jsdelivr|cdn/i)
    expect(TROIKA_TEXT_CONFIG.useWorker).toBe(false)
    expect(TROIKA_TEXT_CONFIG.defaultFontURL).toBe(ROOM_LABEL_FONT)
  })

  it('图纸层标签放在 JSON 的 label 点上，地下室仍用原方案，id 唯一', () => {
    const labels = roomLabelsFromPlan(getFloorPlan('F12')!)
    const basement = basementRoomLabels()
    expect(labels.length).toBeGreaterThan(10)
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
    expect(characters).toMatch(/洽/)
    expect(characters).toMatch(/丙/)
    expect(characters).toMatch(/x/)
    expect(characters).not.toMatch(/×/)
    expect(characters).not.toMatch(/嗆/)
    expect(new Set(labels.map((label) => label.id)).size).toBe(labels.length)
    expect(new Set(basement.map((label) => label.id)).size).toBe(basement.length)
  })

  it('远机位把世界字号抬到至少 13 px', () => {
    const far = worldFontSizeForDistance(180, 768, 48, 13)
    const near = worldFontSizeForDistance(18, 768, 48, 13)
    const farPx = far / ((2 * Math.tan((48 * Math.PI) / 360) * 180) / 768)
    expect(far).toBeGreaterThan(near)
    expect(farPx).toBeGreaterThanOrEqual(12.5)
  })

  it('特写时屏幕字号不超过 16 px，下限仍 ≥13 px', () => {
    expect(LABEL_MAX_PX).toBe(16)
    expect(LABEL_MIN_PX).toBe(13)
    const close = worldFontSizeForDistance(8, 712, 42)
    const closePx = close / ((2 * Math.tan((42 * Math.PI) / 360) * 8) / 712)
    expect(closePx).toBeLessThanOrEqual(16.05)
    const mid = worldFontSizeForDistance(40, 768, 48)
    const midPx = mid / ((2 * Math.tan((48 * Math.PI) / 360) * 40) / 768)
    expect(midPx).toBeGreaterThanOrEqual(12.5)
    expect(midPx).toBeLessThanOrEqual(16.05)
  })

  it('目标附近的标签降透明度，远处保持不透明', () => {
    expect(labelFadeForTarget({ x: 400, y: 300 }, { x: 410, y: 308 }, 16)).toBeLessThan(1)
    expect(labelFadeForTarget({ x: 80, y: 80 }, { x: 700, y: 500 }, 16)).toBe(1)
  })

  it('单个标签透明度走 useFrame，不额外 sync', () => {
    const source = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    const frame = source.slice(source.lastIndexOf('useFrame'))
    expect(frame).toMatch(/applyMemberFades/)
    expect(frame).not.toMatch(/\.sync\(/)
    expect(source.match(/batch\??\.sync/g)?.length).toBe(2)
  })

  it('换行用 maxWidth + break-word，不用 clipRect', () => {
    const source = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/overflowWrap = 'break-word'/)
    expect(source).toMatch(/maxWidth/)
    expect(source).not.toMatch(/clipRect/)
  })

  it('整批深色字配浅色描边，描边约 0.12 em', () => {
    expect(ROOM_LABEL_COLOR).toBe('#17324d')
    expect(ROOM_LABEL_OUTLINE_COLOR).toBe('#ffffff')
    expect(ROOM_LABEL_OUTLINE_EM).toBe(0.12)
    expect(roomLabelOutlineWidth(0.78)).toBeCloseTo(0.0936)
    expect(roomLabelOutlineWidth(0.5)).toBe(0.08)
    const source = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/ROOM_LABEL_OUTLINE_COLOR/)
    expect(source).toMatch(/batch.outlineWidth/)
  })
})
