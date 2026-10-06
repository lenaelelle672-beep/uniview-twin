import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MIN_VISIBLE_WIDTH_PX,
  focalOffsetToVisibleCenter,
  pointInVisibleRegion,
  rectCenter,
  rectWidth,
  shouldCollapseDrawer,
  visibleCanvasRegion,
  worldPerPixel,
} from './visibleFocus'

function rect(left: number, right: number, top = 56, bottom = 768) {
  return { left, right, top, bottom }
}

describe('可见画布区与 focal offset', () => {
  it('1366：抽屉盖住左半画布，可见区在抽屉右侧', () => {
    const canvas = rect(232, 1118)
    const drawer = rect(232, 792)
    const left = rect(0, 232)
    const right = rect(1118, 1366)
    const visible = visibleCanvasRegion(canvas, [drawer, left, right])
    expect(visible.left).toBeCloseTo(792)
    expect(visible.right).toBeCloseTo(1118)
    expect(rectWidth(visible)).toBeCloseTo(326)
    expect(shouldCollapseDrawer(rectWidth(visible))).toBe(false)
    const mid = rectCenter(visible)
    expect(mid.x).toBeCloseTo(955)
    const offset = focalOffsetToVisibleCenter(canvas, visible, 9.1, 42, 712)
    const wpp = worldPerPixel(9.1, 42, 712)
    expect(offset.x).toBeCloseTo(-(955 - 675) * wpp, 5)
    expect(offset.y).toBeCloseTo(0, 5)
    expect(offset.z).toBe(0)
    expect(pointInVisibleRegion({ x: mid.x, y: 412 }, visible)).toBe(true)
  })

  it('1920：可见区更宽，目标对准可见中心', () => {
    const canvas = rect(232, 1672)
    const visible = visibleCanvasRegion(canvas, [rect(232, 792), rect(0, 232), rect(1672, 1920)])
    expect(visible.left).toBeCloseTo(792)
    expect(visible.right).toBeCloseTo(1672)
    expect(rectWidth(visible)).toBeCloseTo(880)
    expect(shouldCollapseDrawer(rectWidth(visible))).toBe(false)
    const mid = rectCenter(visible)
    expect(mid.x).toBeCloseTo(1232)
    const offset = focalOffsetToVisibleCenter(canvas, visible, 9.1, 42, 712)
    expect(offset.x).toBeLessThan(0)
    expect(pointInVisibleRegion({ x: mid.x, y: 412 }, visible, 40)).toBe(true)
  })

  it('1024：全宽抽屉只剩约 76 px，应收成窄条', () => {
    const canvas = rect(208, 804)
    const full = visibleCanvasRegion(canvas, [rect(208, 728), rect(0, 208), rect(804, 1024)])
    expect(full.left).toBeCloseTo(728)
    expect(full.right).toBeCloseTo(804)
    expect(rectWidth(full)).toBeCloseTo(76)
    expect(rectWidth(full)).toBeLessThan(MIN_VISIBLE_WIDTH_PX)
    expect(shouldCollapseDrawer(rectWidth(full))).toBe(true)

    const strip = visibleCanvasRegion(canvas, [rect(208, 256), rect(0, 208), rect(804, 1024)])
    expect(strip.left).toBeCloseTo(256)
    expect(rectWidth(strip)).toBeCloseTo(548)
    expect(shouldCollapseDrawer(rectWidth(strip))).toBe(false)
    const mid = rectCenter(strip)
    expect(pointInVisibleRegion({ x: mid.x, y: 412 }, strip, 40)).toBe(true)
    const offset = focalOffsetToVisibleCenter(canvas, strip, 9.1, 42, 712)
    expect(offset.x).toBeCloseTo(-(mid.x - rectCenter(canvas).x) * worldPerPixel(9.1, 42, 712), 5)
  })

  it('抽屉关上后偏移归零', () => {
    const canvas = rect(232, 1118)
    const visible = visibleCanvasRegion(canvas, [rect(0, 232), rect(1118, 1366)])
    expect(visible.left).toBeCloseTo(232)
    expect(visible.right).toBeCloseTo(1118)
    const offset = focalOffsetToVisibleCenter(canvas, visible, 9.1, 42, 712)
    expect(offset.x).toBeCloseTo(0, 5)
    expect(offset.y).toBeCloseTo(0, 5)
  })

  it('飞行用 setFocalOffset，不用 camera.setViewOffset', () => {
    const source = readFileSync(new URL('./FloorStageCamera.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/setFocalOffset/)
    expect(source).not.toMatch(/setViewOffset/)
  })

  it('像素换算随距离和 FOV 变', () => {
    const near = worldPerPixel(6, 42, 712)
    const far = worldPerPixel(18, 42, 712)
    const wide = worldPerPixel(6, 60, 712)
    expect(far).toBeGreaterThan(near)
    expect(wide).toBeGreaterThan(near)
    const a = focalOffsetToVisibleCenter(rect(0, 800), rect(200, 800), 6, 42, 712)
    const b = focalOffsetToVisibleCenter(rect(0, 800), rect(200, 800), 12, 42, 712)
    expect(b.x).toBeCloseTo(a.x * 2, 5)
  })
})
