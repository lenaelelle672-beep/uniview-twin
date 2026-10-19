import { describe, expect, it } from 'vitest'
import { propNightEmissive } from './emissive'

describe('小资产夜景自发光', () => {
  it('白天关闭发光', () => {
    for (const name of ['lamp_light', 'sign_face', 'sign_face_cn', 'sign_body', 'tree_leaves']) {
      expect(propNightEmissive(name, false)).toEqual({ color: '#000000', intensity: 0 })
    }
  })

  it('夜间字面白光、中文蓝光、底板弱蓝，路灯仍发光', () => {
    expect(propNightEmissive('sign_face', true)).toEqual({ color: '#f4f7ff', intensity: 2.0 })
    expect(propNightEmissive('sign_face_cn', true)).toEqual({ color: '#2f6bff', intensity: 2.1 })
    const body = propNightEmissive('sign_body', true)
    expect(body).toEqual({ color: '#8eb4ff', intensity: 0.5 })
    expect(body.intensity).toBeGreaterThan(0)
    expect(body.intensity).toBeLessThan(propNightEmissive('sign_face', true).intensity)
    expect(body.color.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/)
    const blue = Number.parseInt(body.color.slice(5, 7), 16)
    const red = Number.parseInt(body.color.slice(1, 3), 16)
    expect(blue).toBeGreaterThan(red)
    expect(propNightEmissive('lamp_light', true)).toEqual({ color: '#fff4dc', intensity: 2.8 })
    expect(propNightEmissive('tree_trunk', true)).toEqual({ color: '#000000', intensity: 0 })
  })

  it('夜景强度高于 tip，且不超过灯带 3.0、字面 2.2', () => {
    const lamp = propNightEmissive('lamp_light', true).intensity
    const face = propNightEmissive('sign_face', true).intensity
    const cn = propNightEmissive('sign_face_cn', true).intensity
    const body = propNightEmissive('sign_body', true).intensity
    expect(lamp).toBeGreaterThan(2.4)
    expect(lamp).toBeLessThanOrEqual(3.0)
    expect(face).toBeGreaterThan(1.6)
    expect(face).toBeLessThanOrEqual(2.2)
    expect(cn).toBeGreaterThan(1.8)
    expect(cn).toBeLessThanOrEqual(2.2)
    expect(body).toBeGreaterThan(0.42)
    expect(body).toBeLessThan(face / 2)
    for (const name of ['lamp_light', 'sign_face', 'sign_face_cn', 'sign_body']) {
      expect(propNightEmissive(name, false).intensity).toBe(0)
    }
  })
})
