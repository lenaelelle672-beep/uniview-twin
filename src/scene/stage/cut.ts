import { floorSpec, isFloorId } from '../../data/floors'
import type { ViewMode } from '../../types'

/** 楼板厚度。切面取选中层楼板顶面。 */
export const SLAB_M = 0.16

export function activeFloorId(view: ViewMode, selectedFloor: string | null): string | null {
  if (view !== 'floor' || !selectedFloor || !isFloorId(selectedFloor)) return null
  return selectedFloor
}

/** 选中层以上的楼层外壳需要隐藏。总览时不隐藏。 */
export function hiddenFloorIds(view: ViewMode, selectedFloor: string | null): string[] {
  const active = activeFloorId(view, selectedFloor)
  if (!active) return []
  const elevation = floorSpec(active).elevation
  const ids: string[] = []
  for (const id of ['B1', ...Array.from({ length: 22 }, (_, index) => `F${index + 1}`)]) {
    if (floorSpec(id).elevation > elevation + 0.001) ids.push(id)
  }
  return ids
}

export function isFloorShellHidden(view: ViewMode, selectedFloor: string | null, elevation: number): boolean {
  const active = activeFloorId(view, selectedFloor)
  if (!active) return false
  return elevation > floorSpec(active).elevation + 0.001
}

/** 进入该层后拿掉本层幕墙，楼板顶面以上的外壳由切面裁掉。 */
export function isFloorCurtainOpen(view: ViewMode, selectedFloor: string | null, floorId: string): boolean {
  return activeFloorId(view, selectedFloor) === floorId
}

export function isRoofHidden(view: ViewMode, selectedFloor: string | null): boolean {
  return activeFloorId(view, selectedFloor) != null
}

/**
 * 地上单层（F1–F22）不画地下室楼板。
 * 总览和 B1 单层仍保留。裁切平面在楼板之上，藏不住这块板，必须直接隐藏。
 */
export function isBasementSlabHidden(view: ViewMode, selectedFloor: string | null): boolean {
  const active = activeFloorId(view, selectedFloor)
  if (!active) return false
  return floorSpec(active).level > 0
}

/** 地上单层同时隐藏 B1 色块。条件与楼板相同。 */
export function isBasementZonesHidden(view: ViewMode, selectedFloor: string | null): boolean {
  return isBasementSlabHidden(view, selectedFloor)
}

/** 世界坐标切面高度：选中层楼板顶面。高于此的外壳被裁掉。 */
export function cutElevation(view: ViewMode, selectedFloor: string | null): number | null {
  const active = activeFloorId(view, selectedFloor)
  if (!active) return null
  return floorSpec(active).elevation + SLAB_M
}
