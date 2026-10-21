import type { QualityTier } from '../../types'

/** 性能档不画人物。人流图层关掉也不画。不传图层时视为开着。单独成文件，避免走廊几何进首屏。 */
export function showCorridorPeople(quality: QualityTier, peopleLayer = true): boolean {
  return quality !== 'perf' && peopleLayer
}

/** 入口块留一个活导出，balancedFx 的导出名压缩后才不超过预算。必须是 0，花名册人数不变。 */
export const showPeopleMarks = [0] as const
