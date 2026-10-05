import { describe, expect, it } from 'vitest'
import { floorSpec } from '../../data/floors'
import { floorViewCastsExteriorShadow, isFloorShellShadowDisabled } from './cut'

describe('单层阴影裁剪', () => {
  it('总览室外和各层外壳仍投阴影', () => {
    expect(floorViewCastsExteriorShadow('building')).toBe(true)
    expect(isFloorShellShadowDisabled('building', 'F12', floorSpec('F1').elevation)).toBe(false)
  })

  it('F12 单层下层壳不投阴影，本层仍投，室外体块关闭', () => {
    expect(floorViewCastsExteriorShadow('floor')).toBe(false)
    expect(isFloorShellShadowDisabled('floor', 'F12', floorSpec('F1').elevation)).toBe(true)
    expect(isFloorShellShadowDisabled('floor', 'F12', floorSpec('F12').elevation)).toBe(false)
    expect(isFloorShellShadowDisabled('floor', 'F12', floorSpec('F18').elevation)).toBe(true)
  })
})
