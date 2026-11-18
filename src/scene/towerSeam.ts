import { MeshStandardMaterial } from 'three'
import {
  TOWER_SEAM_BACK_Z,
  TOWER_SEAM_EAST_X,
  TOWER_SEAM_SOUTH_Z,
  TOWER_SEAM_WEST_X,
} from './shell/rings'

/** 槽口内衬相对轮廓内收，给沿槽壁走的已有铝翅留出位置。 */
export const TOWER_SEAM_LINER_INSET_M = 0.2
/** 南向开口再退，让总览 / p2f003 读出凹进的深缝，而不是与南立面齐平的贴面。 */
export const TOWER_SEAM_LINER_MOUTH_M = 1.2

/** 竖缝内衬专用深色，不改幕墙玻璃材质。 */
export const towerSeamMaterial = new MeshStandardMaterial({
  name: '塔楼竖缝内衬',
  color: '#1a1f26',
  roughness: 0.88,
  metalness: 0.04,
  envMapIntensity: 0.06,
})

export function towerSeamLinerTransform(elevation: number, height: number): {
  position: [number, number, number]
  size: [number, number, number]
} {
  const width = TOWER_SEAM_EAST_X - TOWER_SEAM_WEST_X - TOWER_SEAM_LINER_INSET_M * 2
  const south = TOWER_SEAM_SOUTH_Z - TOWER_SEAM_LINER_MOUTH_M
  const north = TOWER_SEAM_BACK_Z + TOWER_SEAM_LINER_INSET_M
  const depth = south - north
  return {
    position: [(TOWER_SEAM_EAST_X + TOWER_SEAM_WEST_X) / 2, elevation + height / 2, (south + north) / 2],
    size: [width, height, depth],
  }
}
