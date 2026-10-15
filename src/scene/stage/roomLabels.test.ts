import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { INTERIOR_WALL_H, labelLiftY } from '../../floors/interiorWall'
import { roomLabelsFromPlan } from '../../floors/labels'
import { TROIKA_TEXT_CONFIG } from './disableTroikaCdn'
import {
  basementRoomLabels,
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  ROOM_LABEL_COLOR,
  ROOM_LABEL_COLOR_BALANCED,
  ROOM_LABEL_FONT,
  ROOM_LABEL_OUTLINE_COLOR,
  ROOM_LABEL_OUTLINE_COLOR_BALANCED,
  ROOM_LABEL_OUTLINE_EM,
  ROOM_LABEL_OUTLINE_MIN,
  ROOM_LABEL_OUTLINE_OPACITY,
  labelFadeForTarget,
  roomLabelCharacters,
  roomLabelColors,
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
    for (const label of labels) {
      expect(label.label[1]).toBeGreaterThan(INTERIOR_WALL_H)
      expect(label.label[1]).toBeCloseTo(labelLiftY(0.78))
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

  it('远机位把世界字号抬到至少 15 px', () => {
    const far = worldFontSizeForDistance(180, 768, 48, 15)
    const near = worldFontSizeForDistance(18, 768, 48, 15)
    const farPx = far / ((2 * Math.tan((48 * Math.PI) / 360) * 180) / 768)
    expect(far).toBeGreaterThan(near)
    expect(farPx).toBeGreaterThanOrEqual(14.5)
  })

  it('特写时屏幕字号不超过 17 px，下限仍 ≥15 px', () => {
    expect(LABEL_MAX_PX).toBe(17)
    expect(LABEL_MIN_PX).toBe(15)
    const close = worldFontSizeForDistance(8, 712, 42)
    const closePx = close / ((2 * Math.tan((42 * Math.PI) / 360) * 8) / 712)
    expect(closePx).toBeLessThanOrEqual(17.05)
    const mid = worldFontSizeForDistance(40, 768, 48)
    const midPx = mid / ((2 * Math.tan((48 * Math.PI) / 360) * 40) / 768)
    expect(midPx).toBeGreaterThanOrEqual(14.5)
    expect(midPx).toBeLessThanOrEqual(17.05)
  })

  it('目标附近的标签降透明度，远处保持不透明', () => {
    expect(labelFadeForTarget({ x: 400, y: 300 }, { x: 410, y: 308 }, 16)).toBeLessThan(1)
    expect(labelFadeForTarget({ x: 80, y: 80 }, { x: 700, y: 500 }, 16)).toBe(1)
  })

  it('单个标签透明度走 useFrame，不额外 sync', () => {
    const source = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    const frame = source.slice(source.lastIndexOf('useFrame'))
    expect(source).toMatch(/writePack[\s\S]*applyMemberFades/)
    expect(frame).toMatch(/writePack\(pack\)/)
    expect(source).not.toMatch(/applyMemberFades[\s\S]{0,180}\.sync\(/)
    expect(source.match(/\.sync\(/g)?.length).toBeGreaterThanOrEqual(1)
    expect(source).toMatch(/bumpSync/)
    expect(source).toMatch(/placement\?\.visible === true/)
    expect(source).toMatch(/orientToCamera/)
    expect(source).toMatch(/RoomLabelBatchedText/)
    expect(source).toMatch(/_members/)
    expect(source).toMatch(/waitCameraRested/)
    expect(source.indexOf('waitCameraRested()')).toBeLessThan(source.indexOf('batch?.sync('))
    expect(source).toMatch(/setBatchVisible/)
  })

  it('转正只在进层/层级/拖动结束计算，不每帧跟相机', () => {
    const source = readFileSync(new URL('./RoomLabels.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/currentAction/)
    expect(source).toMatch(/orientToCamera/)
    expect(source).toMatch(/shouldPack && api\?\.ready && packStepRef/)
    expect(source).toMatch(/packStepRef\.current === 'sync'/)
    expect(source).toMatch(/packStepRef\.current === 'fade'/)
    expect(source).toMatch(/preloadLabelChars/)
    expect(source).not.toMatch(/applyClusterTexts/)
    expect(source).toMatch(/defineProperty\(window, '__twinLabelOverlap'/)
    expect(source).toMatch(/packStepRef\.current !== 'idle'/)
    expect(source).toMatch(/__twinLabelFading === true/)
    expect(source).toMatch(/isCameraRested/)
    expect(source).not.toMatch(/SETTLE_FRAMES/)
    expect(source).toMatch(/item\.locked/)
    expect(source).toMatch(/pointerMovedRef/)
    expect(source).toMatch(/pointerOnCanvasRef/)
    expect(source).toMatch(/pointerPxRef/)
    expect(source).toMatch(/pickHoverLabel/)
    expect(source).toMatch(/addEventListener\('pointermove'/)
    expect(source).toMatch(/addEventListener\('pointerleave'/)
    expect(source).toMatch(/hiddenLayout/)
    expect(source).toMatch(/__twinSlab/)
    expect(source).toMatch(/__twinLabelFading/)
    expect(source).toMatch(/FADE_IN_MS = 80/)
    expect(source).toMatch(/askFrame/)
    expect(source).toMatch(/startFadeLoop/)
    expect(source).toMatch(/floorId === 'F7'/)
    expect(source).toMatch(/setBatchVisible\(false\)/)
    expect(source).toMatch(/setBatchVisible\(true\)/)
    expect(source).toMatch(/requestAnimationFrame/)
    expect(source).toMatch(/useMemo/)
    expect(source).toMatch(/pointsKey/)
    expect(source).toMatch(/useThree\(\(state\) => state\.camera\)/)
    expect(source).toMatch(/useThree\(\(state\) => state\.size\)/)
    expect(source).not.toMatch(/useThree\(\)/)
    expect(source).not.toMatch(/if \(stripRef\.current && !dragging/)
  })

  it('换行用 maxWidth + break-word，不用 clipRect', () => {
    const source = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/overflowWrap = 'break-word'/)
    expect(source).toMatch(/maxWidth/)
    expect(source).not.toMatch(/clipRect/)
  })

  it('整批深色字配浅色细描边；perf 关 toneMapped，balanced 用更深源色', () => {
    expect(ROOM_LABEL_COLOR).toBe('#17324d')
    expect(ROOM_LABEL_OUTLINE_COLOR).toBe('#ffffff')
    expect(roomLabelColors('perf')).toEqual({ color: '#17324d', outline: '#ffffff' })
    expect(roomLabelColors('balanced')).toEqual({
      color: ROOM_LABEL_COLOR_BALANCED,
      outline: ROOM_LABEL_OUTLINE_COLOR_BALANCED,
    })
    expect(roomLabelColors('high').color).toBe(ROOM_LABEL_COLOR_BALANCED)
    expect(ROOM_LABEL_OUTLINE_EM).toBe(0.045)
    expect(ROOM_LABEL_OUTLINE_MIN).toBe(0.03)
    expect(ROOM_LABEL_OUTLINE_OPACITY).toBe(0.78)
    expect(roomLabelOutlineWidth(0.78)).toBeCloseTo(0.0351)
    expect(roomLabelOutlineWidth(0.5)).toBe(0.03)
    const source = readFileSync(new URL('./BatchedRoomLabels.tsx', import.meta.url), 'utf8')
    const members = source.split('new Text()')
    expect(members.length).toBeGreaterThanOrEqual(3)
    expect(members[1]).toMatch(/outlineWidth = outlineWidth/)
    expect(members[1]).toMatch(/outlineColor = paletteRef.current.outline/)
    expect(members[2]).toMatch(/outlineWidth = outlineWidth/)
    expect(members[2]).toMatch(/outlineColor = paletteRef.current.outline/)
    expect(source).toMatch(/material.toneMapped = false/)
    expect(source).toMatch(/ROOM_LABEL_OUTLINE_OPACITY/)
    expect(source).not.toMatch(/batch\.outlineWidth/)
    expect(source).not.toMatch(/MONITOR_LAYER|labelAfterTone|labelLayer/)
  })
})
