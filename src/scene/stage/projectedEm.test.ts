import { readFileSync } from 'node:fs'
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { LABEL_MAX_PX, LABEL_MIN_PX } from './roomLabels'
import {
  LABEL_TARGET_PX,
  maxProjectedEmPx,
  projectedEmHeightPx,
  worldFontSizeFromProjectedEm,
} from './RoomLabels'

function facingPx(distance: number, fontSize: number, height: number, fov: number) {
  return fontSize / ((2 * Math.tan((fov * Math.PI) / 360) * distance) / height)
}

describe('单层房间标签射影字号', () => {
  it('正对相机时与 FOV 估算一致，俯视时更短', () => {
    const facing = new PerspectiveCamera(48, 1366 / 768, 0.1, 2000)
    facing.position.set(0, 0, 10)
    facing.lookAt(0, 0, 0)
    facing.updateProjectionMatrix()
    facing.updateMatrixWorld()
    const top = new Vector3(0, 0.5, 0)
    const bottom = new Vector3(0, -0.5, 0)
    const facingHeight = projectedEmHeightPx(top, bottom, facing, { width: 1366, height: 768 })
    expect(facingHeight).toBeCloseTo(facingPx(10, 1, 768, 48), 0)

    const oblique = new PerspectiveCamera(48, 1366 / 768, 0.1, 2000)
    oblique.position.set(0, 10, 10)
    oblique.lookAt(0, 0, 0)
    oblique.updateProjectionMatrix()
    oblique.updateMatrixWorld()
    const tilted = projectedEmHeightPx(top, bottom, oblique, { width: 1366, height: 768 })
    expect(tilted).toBeLessThan(facingHeight * 0.85)
    expect(tilted).toBeGreaterThan(facingHeight * 0.4)
  })

  it('按全层最大射影 em 把屏上字高夹到 15–17，目标 16', () => {
    expect(LABEL_TARGET_PX).toBe(16)
    const camera = new PerspectiveCamera(48, 1366 / 768, 0.1, 2000)
    camera.position.set(12, 42, 38)
    camera.lookAt(0, 3, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const labels = [
      { label: [0, 3.2, 0] as [number, number, number] },
      { label: [8, 3.2, -6] as [number, number, number] },
      { label: [-6, 3.2, 9] as [number, number, number] },
    ]
    const seed = 0.78
    const { maxPx } = maxProjectedEmPx(null, labels, camera, { width: 1366, height: 768 }, seed)
    const fontSize = worldFontSizeFromProjectedEm(seed, maxPx)
    expect(fontSize * (maxPx / seed)).toBeGreaterThanOrEqual(LABEL_MIN_PX)
    expect(fontSize * (maxPx / seed)).toBeLessThanOrEqual(LABEL_MAX_PX)
    expect(fontSize * (maxPx / seed)).toBeCloseTo(LABEL_TARGET_PX, 5)
  })

  it('特写仍把最大屏上字高压在 17 px 内，并忽略相机背后的点', () => {
    const camera = new PerspectiveCamera(42, 1366 / 712, 0.1, 2000)
    camera.position.set(2.2, 6.4, 5.1)
    camera.lookAt(0, 1.2, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const labels = [
      { label: [0, 3.2, 0] as [number, number, number] },
      { label: [4, 3.2, -3] as [number, number, number] },
      { label: [0, 3.2, 20] as [number, number, number] },
    ]
    const seed = 0.78
    const { maxPx } = maxProjectedEmPx(null, labels, camera, { width: 1366, height: 712 }, seed)
    const fontSize = worldFontSizeFromProjectedEm(seed, maxPx)
    const nextPx = fontSize * (maxPx / seed)
    expect(nextPx).toBeLessThanOrEqual(LABEL_MAX_PX + 1e-6)
    expect(nextPx).toBeGreaterThanOrEqual(LABEL_MIN_PX)

    const behind = new Vector3(0, 3.7, 12)
    const behindBottom = new Vector3(0, 2.7, 12)
    expect(projectedEmHeightPx(behind, behindBottom, camera, { width: 1366, height: 712 })).toBe(0)

    const off = new Vector3(80, 3.2, 0)
    const offBottom = new Vector3(80, 2.2, 0)
    expect(projectedEmHeightPx(off, offBottom, camera, { width: 1366, height: 712 })).toBe(0)
  })

  it('字号只按射影 em 算，不用 ScreenSizer，静止阈值避免每帧 setState', () => {
    const source = readFileSync(new URL('./RoomLabels.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/projectedEmHeightPx/)
    expect(source).toMatch(/worldFontSizeFromProjectedEm/)
    expect(source).toMatch(/sizedRef/)
    expect(source).not.toMatch(/ScreenSizer/)
    expect(source).not.toMatch(/worldFontSizeForDistance/)
  })
})
