import { STRUCTURE_EDGE_NAME, STRUCTURE_WIREFRAME_NAME } from './structureLatch'

/** 与 drei Edges 的默认 threshold 相同。three EdgesGeometry 自己的默认是 1，这里不用那个。 */
export const STRUCTURE_EDGE_THRESHOLD = 15
/**
 * 负数把线往相机拉，离开共面的壳。和铺装的 polygonOffset 同一方向。
 * LineBasicMaterial.linewidth 保持 1：WebGL 里更粗的线宽不可靠，这里不依赖它。
 */
export const STRUCTURE_EDGE_POLYGON_OFFSET = -4
/** 高于默认壳（0），低于选中高亮（9）和圆标（10）。深度由 polygonOffset 保住。 */
export const STRUCTURE_EDGE_ORDER = 4

export const STRUCTURE_EDGE_COLOR = {
  day: '#1b2836',
  night: '#d7e6f4',
  model: '#2a3138',
} as const

const FLOOR_STRUCTURE = new Set(['FloorSlab', 'FloorCores'])

export interface StructureEdgeCandidate {
  name: string
  parentName: string
  view: string
  floorId: string | null
  visible: boolean
  instanced: boolean
}

/**
 * 总览：楼壳。单层：当前层的楼板、核心筒和本层层带。
 * 家具、柱、墙实例不在名单里，名字对不上就跳过。
 */
export function structureEdgeKind(candidate: StructureEdgeCandidate): 'shell' | 'floor' | null {
  if (!candidate.visible || candidate.instanced) return null
  if (candidate.name === STRUCTURE_EDGE_NAME || candidate.name === STRUCTURE_WIREFRAME_NAME) return null
  if (candidate.view === 'floor') {
    if (!candidate.floorId) return null
    if (FLOOR_STRUCTURE.has(candidate.name)) return 'floor'
    if (candidate.name === `FloorBand-${candidate.floorId}`) return 'floor'
    return null
  }
  if (candidate.view !== 'building') return null
  if (candidate.name.startsWith('FloorCurtain-') || candidate.name.startsWith('FloorBand-')) return 'shell'
  if (candidate.name === 'RoofParapet' || candidate.name === 'B1Slab') return 'shell'
  if (candidate.parentName === 'Podium' && candidate.name === '') return 'shell'
  return null
}

export function structureEdgeColor(state: { dayNight: string; presentation: string }): string {
  if (state.presentation === 'model') return STRUCTURE_EDGE_COLOR.model
  if (state.dayNight === 'night') return STRUCTURE_EDGE_COLOR.night
  return STRUCTURE_EDGE_COLOR.day
}
