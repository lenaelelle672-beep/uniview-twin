import { floorSpec, isFloorId } from '../data/floors'
import { CONTACT_SHADOW_Y } from '../scene/shellVersion'
import { SLAB_M } from '../scene/stage/cut'
import type { DayNight, ViewMode } from '../types'

/** 1 米小格、10 米主格。和场地「米、Y 向上、+X 东、-Z 北」同一套。 */
export const GRID_CELL_M = 1
export const GRID_SECTION_M = 10
/** 三轴长度。总览里大约占竖向画面的一小段，单层里大约跨过几张工位。 */
export const GRID_AXIS_M = 20
/**
 * 坐标轴抬离格网平面，避免和格线共面闪烁。
 * 格网本身已经离开地面和接触阴影。
 */
export const AXIS_LIFT_M = 0.03
/**
 * 接触阴影在 y=0.22，场地最高大约 0.20。
 * 再抬 0.12，总览斜看时不会和地面 PBR、接触阴影抢深度。
 */
export const GROUND_CLEAR_M = 0.12
/** 楼板顶面之上一点点，避免和楼板共面。 */
export const FLOOR_CLEAR_M = 0.04
/** 总览拉远上限约 520 米，淡出跟这个视距走。 */
export const OVERVIEW_FADE_M = 520
/** 单层只盖住本层楼板，不把整座场地的格线拖进室内。 */
export const FLOOR_FADE_M = 48
/**
 * 世界原点在塔楼平面中心，总览斜看时 20 米轴会埋进塔身。
 * 轴标改放到东座南墙外的铺地上（约 x=60、z=120），方向仍是世界轴。
 * 单层原点露在楼板上，不挪。
 */
export const OVERVIEW_AXES_X = 60
export const OVERVIEW_AXES_Z = 120

export interface GridPlaneInput {
  view: ViewMode
  floorId: string | null
  dayNight: DayNight
  presentation: 'lit' | 'model'
}

export interface GridPlane {
  y: number
  fadeDistance: number
  cellColor: string
  sectionColor: string
  /** 坐标轴落点。格线仍从世界原点起算，只有轴标挪到能看见的地方。 */
  axesX: number
  axesZ: number
}

/**
 * 总览贴在接触阴影之上。进层贴在该层楼板顶面之上。
 * 蓝图没有三维场景，返回 null。
 */
export function gridPlane(input: GridPlaneInput): GridPlane | null {
  const colors =
    input.presentation === 'model' || input.dayNight === 'night'
      ? { cellColor: '#9ec3de', sectionColor: '#f7fbff' }
      : { cellColor: '#35506b', sectionColor: '#0e2744' }

  if (input.view === 'blueprint') return null
  if (input.view === 'floor') {
    if (!input.floorId || !isFloorId(input.floorId)) return null
    return {
      y: floorSpec(input.floorId).elevation + SLAB_M + FLOOR_CLEAR_M,
      fadeDistance: FLOOR_FADE_M,
      axesX: 0,
      axesZ: 0,
      ...colors,
    }
  }
  return {
    y: CONTACT_SHADOW_Y + GROUND_CLEAR_M,
    fadeDistance: OVERVIEW_FADE_M,
    axesX: OVERVIEW_AXES_X,
    axesZ: OVERVIEW_AXES_Z,
    ...colors,
  }
}

export function acceptsGridKey(event: {
  key: string
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}): boolean {
  if (event.isComposing || event.repeat || event.altKey || event.metaKey || event.ctrlKey) return false
  if (event.key !== 'g' && event.key !== 'G') return false
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
  if (event.target?.isContentEditable) return false
  return true
}
