import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  USER_CAMERA_SMOOTH_TIME,
  clampControlDelta,
  floorFramingGlide,
  sameCameraIntent,
  userCameraMove,
  type CameraSnap,
} from './cameraTransition'

function snap(partial: Partial<CameraSnap> = {}): CameraSnap {
  return {
    view: 'building',
    cam: null,
    spread: false,
    width: 1366,
    height: 768,
    ...partial,
  }
}

describe('用户可感镜头过渡', () => {
  it('smoothTime 取适中值，不是 0', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBeGreaterThan(0.2)
    expect(USER_CAMERA_SMOOTH_TIME).toBeLessThan(0.8)
  })

  it('空档很大时单帧 delta 被封顶，过渡不会一帧跳完', () => {
    expect(clampControlDelta(2.4)).toBeCloseTo(0.1)
    expect(clampControlDelta(0.016)).toBeCloseTo(0.016)
    expect(clampControlDelta(0)).toBe(0)
    expect(clampControlDelta(Number.NaN)).toBe(0)
    const rig = readFileSync(new URL('../../components/scene/CameraRig.tsx', import.meta.url), 'utf8')
    expect(rig).toMatch(/clampControlDelta/)
  })

  it('没出过帧或没有上一镜时保持瞬时', () => {
    const next = snap()
    expect(userCameraMove({ presented: false, prev: snap({ view: 'floor' }), next: snap() })).toBeNull()
    expect(userCameraMove({ presented: true, prev: null, next })).toBeNull()
  })

  it('回总览要过渡，爆炸和缩放仍瞬时', () => {
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ view: 'floor', spread: false }),
        next: snap({ view: 'building', spread: false }),
      }),
    ).toBe('back-overview')
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ view: 'floor', spread: false }),
        next: snap({ view: 'building', spread: true }),
      }),
    ).toBe('back-overview')
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ spread: false }),
        next: snap({ spread: true }),
      }),
    ).toBeNull()
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ width: 1366 }),
        next: snap({ width: 1920 }),
      }),
    ).toBeNull()
  })

  it('总览里切换机位要过渡，同一机位不飞', () => {
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ cam: null }),
        next: snap({ cam: 'east' }),
      }),
    ).toBe('pose')
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ cam: 'east' }),
        next: snap({ cam: 'photo1' }),
      }),
    ).toBe('pose')
    expect(
      userCameraMove({
        presented: true,
        prev: snap({ cam: 'east' }),
        next: snap({ cam: 'east' }),
      }),
    ).toBeNull()
  })

  it('进层：看过画面且目标变了才滑，缩放和冷启动不滑', () => {
    expect(floorFramingGlide({ seen: true, targetChanged: true, resizeOnly: false })).toBe(true)
    expect(floorFramingGlide({ seen: false, targetChanged: true, resizeOnly: false })).toBe(false)
    expect(floorFramingGlide({ seen: true, targetChanged: false, resizeOnly: true })).toBe(false)
    expect(floorFramingGlide({ seen: true, targetChanged: false, resizeOnly: false })).toBe(false)
  })

  it('同一视点的依赖重跑不算新的用户镜头', () => {
    const pose = snap({ cam: 'east' })
    expect(sameCameraIntent(pose, snap({ cam: 'east' }))).toBe(true)
    expect(sameCameraIntent(pose, snap({ cam: 'photo1' }))).toBe(false)
    expect(sameCameraIntent(null, pose)).toBe(false)
    expect(sameCameraIntent(snap({ width: 800 }), snap({ width: 1366 }))).toBe(false)
  })

  it('总览 fit 仍瞬时量框，用户路径才 enableTransition', () => {
    const rig = readFileSync(new URL('../../components/scene/CameraRig.tsx', import.meta.url), 'utf8')
    expect(rig).toMatch(/smoothTime=\{USER_CAMERA_SMOOTH_TIME\}/)
    expect(rig).not.toMatch(/smoothTime=\{0\}/)
    expect(rig).toMatch(/sameCameraIntent\(previous, nextSnap\) && gliding\.current/)
    expect(rig).toMatch(/fitToBox\(bounds, false/)
    expect(rig).toMatch(/maxPolarAngle = Math\.PI \/ 2 - dip/)
    expect(rig).toMatch(/setLookAt\(end\.px, end\.py, end\.pz, end\.tx, end\.ty, end\.tz, true\)/)
    expect(rig).toMatch(/import\('\.\.\/\.\.\/scene\/stage\/cameraMotion'\)/)
    expect(rig).not.toMatch(/from '\.\.\/\.\.\/scene\/stage\/cameraRest'/)
    expect(rig).not.toMatch(/from '\.\.\/\.\.\/scene\/frameSchedule'/)
    expect(rig).toMatch(/gliding\.current\) return/)
    const motion = readFileSync(new URL('./cameraMotion.ts', import.meta.url), 'utf8')
    expect(motion).toMatch(/watchCameraRest\(input\.rig, input\.invalidate\)/)
    expect(motion).toMatch(/retainFrameChannel\('motion'\)/)
    expect(motion).not.toMatch(/softShadows/)
    const floor = readFileSync(new URL('./FloorStageCamera.tsx', import.meta.url), 'utf8')
    expect(floor).toMatch(/fitToBox\(box, false\)/)
    expect(floor).toMatch(/floorFramingGlide/)
    expect(floor).toMatch(/setLookAt\(end\.x, end\.y, end\.z, endTarget\.x, endTarget\.y, endTarget\.z, true\)/)
    expect(floor).toMatch(/markCameraRested\('setLookAt'\)/)
    expect(floor).not.toMatch(/smoothTime = 0/)
  })
})
