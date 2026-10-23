/**
 * T063 × T060 门闩。
 *
 * 图层键：`wireframe`（本任务）、`edges`（T060）。
 * 两个都为真时 Edges 胜出，这里不挂 Wireframe。优先级与 T060 相同（prefer Edges）。
 * 壳和当前层上不会叠两套边。只关 wireframe 会卸掉线框；Edges 仍由 T060 画。
 * 缺省或 false 都不画。T060 在 `edges === true` 时继续画 Edges，不要因为 wireframe 也开着就让出。
 */
export const WIREFRAME_LAYER = 'wireframe' as const
export const EDGES_LAYER = 'edges' as const

export type EdgeOverlayFlags = {
  wireframe?: boolean
  edges?: boolean
}

export function readEdgeOverlayFlags(layers: object | null | undefined): EdgeOverlayFlags {
  if (!layers) return {}
  const bag = layers as EdgeOverlayFlags
  return {
    wireframe: bag.wireframe === true,
    edges: bag.edges === true,
  }
}

/** T060：为真就画 Edges，即使 wireframe 也开着。 */
export function edgesOverlayOn(layers: object | null | undefined): boolean {
  return readEdgeOverlayFlags(layers).edges === true
}

/** 仅线框开且棱边关。两边都开时返回 false，避免和 Edges 叠边。 */
export function wireframeOverlayOn(layers: object | null | undefined): boolean {
  const flags = readEdgeOverlayFlags(layers)
  if (flags.edges) return false
  return flags.wireframe === true
}
