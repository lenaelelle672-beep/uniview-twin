import { describe, expect, it } from 'vitest'
import { CAMERA_IDS } from '../types'
import { CAMERA_LIMITS, CAMERA_POSES, maxPolarAngleAboveGround, poseDistance } from './cameras'

describe('相机限制', () => {
  it('目标很高时仍允许相机降到接近地面，但不会更低', () => {
    const phi = maxPolarAngleAboveGround(40, 180, 0.85)
    const lowest = 40 + 180 * Math.cos(phi)
    expect(lowest).toBeCloseTo(0.85, 5)
    expect(phi).toBeGreaterThan(Math.PI / 2)
  })

  it('目标就在地面附近时，极角停在水平线上方', () => {
    const phi = maxPolarAngleAboveGround(0.35, 18, 0.85)
    expect(phi).toBeLessThan(Math.PI / 2)
    expect(0.35 + 18 * Math.cos(phi)).toBeCloseTo(0.85, 5)
  })

  it('五个固定机位和总览都在缩放范围内，且相机在地面以上', () => {
    const poses = [CAMERA_POSES.overview, ...CAMERA_IDS.map((id) => CAMERA_POSES[id])]
    for (const pose of poses) {
      expect(pose.position[1]).toBeGreaterThanOrEqual(CAMERA_LIMITS.minCameraY)
      expect(pose.target[1]).toBeGreaterThanOrEqual(CAMERA_LIMITS.minTargetY)
      const distance = poseDistance(pose)
      expect(distance).toBeGreaterThan(CAMERA_LIMITS.minDistance)
      expect(distance).toBeLessThan(CAMERA_LIMITS.maxDistance)
      expect(pose.fov).toBeGreaterThan(15)
      expect(pose.fov).toBeLessThan(75)
    }
  })
})
