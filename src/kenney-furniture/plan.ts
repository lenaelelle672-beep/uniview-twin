/** T102：Kenney Furniture Kit（CC0）桌、椅种子。只挂单层休息姿态的前几套工位。 */

export const KENNEY_DESK_URL = '/models/kenney/desk.glb'
export const KENNEY_CHAIR_URL = '/models/kenney/chairDesk.glb'

/** 试挂上限。整层工位矩阵仍是盒子。4 套桌椅，渲染三角面约为 8 套的一半。 */
export const KENNEY_SEED_CAP = 4

/** 与程序化工位桌面 1.4×0.7 对齐，等比缩进这个脚印。 */
export const DESK_FOOTPRINT = { width: 1.4, depth: 0.7 }

/** 办公椅脚印。高度跟等比缩放，大约落到 0.9 米。 */
export const CHAIR_FOOTPRINT = { width: 0.5, depth: 0.46 }

/**
 * 椅子相对工位原点的本地 +Z。
 * 程序化椅子几何在 z=0.62，屏幕在 -Z。种子跟这一侧，不另写一套落点。
 */
export const CHAIR_SLOT_Z = 0.62

/** 书桌抽屉朝模型 +Z，对着坐的人，不用再转。 */
export const DESK_YAW = 0

/**
 * Kenney 椅背在模型 -Z。坐的人要朝屏幕（-Z）看，所以绕 Y 转 180° 再放到椅子落点。
 */
export const CHAIR_YAW = Math.PI

export interface Bounds {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export interface Footprint {
  width: number
  depth: number
}

export interface FurnitureFit {
  scale: number
  centerX: number
  centerZ: number
  minY: number
  offsetZ: number
}

export function kenneySeedCount(total: number, cap = KENNEY_SEED_CAP): number {
  if (!Number.isFinite(total) || total < 0) throw new Error('工位数')
  if (cap < 1) throw new Error('种子上限')
  return Math.min(Math.floor(total), cap)
}

/** 把模型包围盒等比放进脚印，底面落到 y=0，再在本地 Z 上挪椅子。 */
export function fitToFootprint(bounds: Bounds, footprint: Footprint, offsetZ = 0): FurnitureFit {
  const sizeX = bounds.maxX - bounds.minX
  const sizeZ = bounds.maxZ - bounds.minZ
  if (!(sizeX > 0) || !(sizeZ > 0)) throw new Error('家具包围盒为空')
  if (!(footprint.width > 0) || !(footprint.depth > 0)) throw new Error('家具脚印')
  return {
    scale: Math.min(footprint.width / sizeX, footprint.depth / sizeZ),
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerZ: (bounds.minZ + bounds.maxZ) / 2,
    minY: bounds.minY,
    offsetZ,
  }
}

export interface KenneyGateInput {
  view: string
  floorId: string | null
  exploded: boolean
  explodeProgress: number
  stationProgress: number
  stationActive: boolean
  stationAnimating: boolean
}

/**
 * 总览、楼层爆炸或工位拆解期间不挂。
 * 不读 __twinReady / 首帧标记：进层时 RenderProbe 会清掉它们，清完可能不再写回。
 * 模块本身只从 dock 晚加载进来，总览首屏不会请求 GLB。
 * 挂上的是另一组实例，不写 WorkstationDesks / WorkstationChairs 的矩阵。
 */
export function kenneyFurnitureVisible(input: KenneyGateInput): boolean {
  if (input.view !== 'floor' || !input.floorId) return false
  if (input.exploded || input.explodeProgress > 0) return false
  if (input.stationActive || input.stationAnimating || input.stationProgress > 0) return false
  return true
}
