import type { QualityTier } from '../types'

/**
 * 方案第 8 节的像素比上限。
 * 传给 R3F `dpr={[1, cap]}` 后，画布像素比是 devicePixelRatio 夹在 1 和 cap 之间的结果。
 * devicePixelRatio 为 2 时：性能 1、均衡 1.5、高画质 2。
 */
export const QUALITY_DPR_CAP: Record<QualityTier, number> = {
  perf: 1,
  balanced: 1.5,
  high: 2,
}

export function qualityDprRange(quality: QualityTier): [number, number] {
  return [1, QUALITY_DPR_CAP[quality]]
}

/** 与 R3F calculateDpr 相同的夹取，便于单测。 */
export function resolveQualityDpr(quality: QualityTier, devicePixelRatio: number): number {
  const [min, max] = qualityDprRange(quality)
  return Math.min(Math.max(min, devicePixelRatio), max)
}

/** 精细树只在均衡/高画质的主 pass 使用；阴影改用远景树叶。性能档不引用精细树。 */
export function selectTreeModels(quality: QualityTier): { visual: 'hi' | 'lo'; shadow: 'lo' | null } {
  if (quality === 'perf') return { visual: 'lo', shadow: null }
  return { visual: 'hi', shadow: 'lo' }
}

/** 从低到高。自动降档 / 升档都走这一列，避免和 DPR 上限各写一套。 */
const QUALITY_LADDER: QualityTier[] = ['perf', 'balanced', 'high']

export function qualityTierRank(quality: QualityTier): number {
  const index = QUALITY_LADDER.indexOf(quality)
  return index < 0 ? 0 : index
}

export function lowerQualityTier(quality: QualityTier): QualityTier {
  const index = QUALITY_LADDER.indexOf(quality)
  if (index <= 0) return 'perf'
  return QUALITY_LADDER[index - 1]
}

export function raiseQualityTier(quality: QualityTier): QualityTier {
  const index = QUALITY_LADDER.indexOf(quality)
  if (index < 0) return 'balanced'
  if (index >= QUALITY_LADDER.length - 1) return 'high'
  return QUALITY_LADDER[index + 1]
}
