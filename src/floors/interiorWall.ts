/** 单层内墙 / 核心筒挤出高度（米）。与 `JsonFloorInterior`、塔楼 `geometry` 共用。 */
export const INTERIOR_WALL_H = 2.55
/** 标签底边相对墙顶的余量（米），字从房间上方露出，不关 depthTest。 */
export const LABEL_ABOVE_WALL_M = 0.16

/** 居中锚点的标签中心高度：墙顶 + 余量 + 半个字高。 */
export function labelLiftY(fontSize: number): number {
  return INTERIOR_WALL_H + LABEL_ABOVE_WALL_M + Math.max(fontSize, 0.5) / 2
}
