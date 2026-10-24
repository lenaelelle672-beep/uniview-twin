import { demoEditActive } from './flag'

/**
 * T064 / D730。演示铭牌开关。
 * 不放进 LayerFlags：缺省字段保持 undefined，图层判断不会变成 undefined。
 * 默认关。`layers.plaques === true` 或地址 `?demoEdit=1` 才开，而且只在单层。
 * 落点不放在这里，避免 DemandLoop 把铭牌分包再拉回来。
 */

export const PLAQUE_LAYER = 'plaques' as const

export function plaqueLayerOn(layers: object | null | undefined): boolean {
  if (!layers) return false
  return (layers as { plaques?: boolean }).plaques === true
}

/** 默认关。单层里，图层或 ?demoEdit=1 任一为真才要铭牌。 */
export function plaquesWanted(view: string, layers: object | null | undefined, search?: string): boolean {
  if (view !== 'floor') return false
  return plaqueLayerOn(layers) || demoEditActive(search)
}
