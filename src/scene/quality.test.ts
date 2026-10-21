import { describe, expect, it } from 'vitest'
import { lowerQualityTier, qualityTierRank, raiseQualityTier } from './adaptiveQuality'
import { resolveQualityDpr, selectTreeModels } from './quality'

describe('画质档像素比', () => {
  it('devicePixelRatio=2 时性能 1、均衡 1.5、高画质 2', () => {
    expect(resolveQualityDpr('perf', 2)).toBe(1)
    expect(resolveQualityDpr('balanced', 2)).toBe(1.5)
    expect(resolveQualityDpr('high', 2)).toBe(2)
  })

  it('不超过设备像素比，也不低于 1', () => {
    expect(resolveQualityDpr('balanced', 1)).toBe(1)
    expect(resolveQualityDpr('high', 1)).toBe(1)
    expect(resolveQualityDpr('high', 3)).toBe(2)
    expect(resolveQualityDpr('perf', 0.5)).toBe(1)
  })
})

describe('树模型按档位选择', () => {
  it('性能档只用远景树，不加载精细树做阴影', () => {
    expect(selectTreeModels('perf')).toEqual({ visual: 'lo', shadow: null })
  })

  it('均衡和高画质主模型用精细树，阴影用远景树叶', () => {
    expect(selectTreeModels('balanced')).toEqual({ visual: 'hi', shadow: 'lo' })
    expect(selectTreeModels('high')).toEqual({ visual: 'hi', shadow: 'lo' })
  })
})

describe('画质档阶梯', () => {
  it('降档停在性能，升档停在高画质', () => {
    expect(lowerQualityTier('high')).toBe('balanced')
    expect(lowerQualityTier('balanced')).toBe('perf')
    expect(lowerQualityTier('perf')).toBe('perf')
    expect(raiseQualityTier('perf')).toBe('balanced')
    expect(raiseQualityTier('balanced')).toBe('high')
    expect(raiseQualityTier('high')).toBe('high')
    expect(qualityTierRank('perf')).toBeLessThan(qualityTierRank('balanced'))
    expect(qualityTierRank('balanced')).toBeLessThan(qualityTierRank('high'))
  })
})
