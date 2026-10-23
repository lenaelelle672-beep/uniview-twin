/**
 * T060 结构边与 T063 Wireframe 的门闩。
 *
 * 两个图层都开时只画 Edges，不画 Wireframe。Edges 胜出，避免两套边叠在一起。
 * T063 把开关写在 layers.wireframe（布尔）。字段还没有时当作关。
 *
 * T063 若改材质的 wireframe，Edges 显示期间会先关掉，并记在 userData.t060Wire，
 * Edges 关掉后再改回去。
 * T063 若单独挂一组线，把对象命名为 StructureWireframe，
 * 或设 userData.structureOverlay = 'wireframe'。Edges 显示期间藏起来，关掉后恢复。
 */

export type StructureOverlayMode = 'off' | 'edges' | 'wireframe'

export interface StructureLayerInput {
  edges?: boolean
  wireframe?: boolean
}

export const STRUCTURE_EDGE_NAME = 'StructureEdges'
export const STRUCTURE_WIREFRAME_NAME = 'StructureWireframe'
export const STRUCTURE_OVERLAY_KEY = 'structureOverlay'
/** Edges 暂时关掉的材质线框。 */
export const STRUCTURE_WIRE_STASH = 't060Wire'
/** Edges 暂时藏起的 Wireframe 对象。 */
export const STRUCTURE_HIDE_STASH = 't060Hide'

/** 同时为真时返回 edges。缺省、false 都不算开。 */
export function structureOverlay(layers: StructureLayerInput | null | undefined): StructureOverlayMode {
  if (!layers) return 'off'
  if (layers.edges === true) return 'edges'
  if (layers.wireframe === true) return 'wireframe'
  return 'off'
}

export function structureOverlayFrom(layers: object | null | undefined): StructureOverlayMode {
  if (!layers) return 'off'
  const record = layers as StructureLayerInput
  return structureOverlay({
    edges: record.edges === true,
    wireframe: record.wireframe === true,
  })
}
