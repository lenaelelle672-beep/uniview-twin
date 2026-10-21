import type { QualityTier } from '../../types'

/** 性能档不画人物。人流图层关掉也不画。不传图层时视为开着。单独成文件，避免走廊几何进首屏。 */
export function showCorridorPeople(quality: QualityTier, peopleLayer = true): boolean {
  return quality !== 'perf' && peopleLayer
}
