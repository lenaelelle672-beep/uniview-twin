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

/** D189：仅软件渲染自动判进性能档（无 ?q=）的 AdaptiveDpr / 初始 dpr 上限。 */
export const SOFTWARE_AUTO_DPR = 0.75

export function qualityDprRange(quality: QualityTier, softwareAuto = false): [number, number] {
  if (softwareAuto) return [SOFTWARE_AUTO_DPR, SOFTWARE_AUTO_DPR]
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
