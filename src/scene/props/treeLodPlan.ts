/**
 * T073：只给已经有 lo 网格的道具加 Detailed。
 * 走廊人物的距离是 [0, 80]，行道树用同一组。
 * 回程加 0.1 滞回，减轻档位边界来回跳。
 * 路灯、屋面字、程序家具没有 lo，不造空壳。
 * 东立面格栅维持自己的近远切换，不静态导入 Detailed。
 * 性能档仍由 T043 selectTreeModels 只挂 lo，这里不再进 hi。
 */

export const TREE_LOD_DISTANCES = [0, 80] as const

export const TREE_LOD_HYSTERESIS = 0.1

export const TREE_LOD_URL = {
  hi: '/models/street-tree-hi.glb',
  lo: '/models/street-tree-lo.glb',
} as const

/** 没有 lo 网格，Detailed 第二档留空会变成空壳。 */
export const LOD_SKIP_NO_LO = ['/models/street-lamp.glb', '/models/roof-sign.glb'] as const

export function treeLodEnabled(quality: string, presentation: string): boolean {
  return quality !== 'perf' && presentation !== 'model'
}

/**
 * 与 three LOD.update 的两档判断一致。
 * previous 为 1 表示远档已经在显示，阈值按滞回下移。
 */
export function treeLodLevel(distance: number, previous: 0 | 1): 0 | 1 {
  const far = TREE_LOD_DISTANCES[1]
  const threshold = previous === 1 ? far - far * TREE_LOD_HYSTERESIS : far
  return distance >= threshold ? 1 : 0
}
