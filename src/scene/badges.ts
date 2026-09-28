import { TOWER } from './siteGeometry'

/** 徽标世界尺寸。层间距 4.2 m，高度必须小于间距，否则俯视时会叠在一起。 */
export const BADGE_WIDTH = 9
export const BADGE_HEIGHT = 2.5

/** 塔楼西侧偏南，总览东南机位能看到，又不挡南立面。 */
export const BADGE_COLUMN_X = TOWER.minX - 16
export const BADGE_COLUMN_Z = TOWER.maxZ + 4

export interface BadgeAnchor {
  id: string
  x: number
  y: number
  z: number
}

export function badgeAnchor(floor: { id: string; elevation: number; height: number }): BadgeAnchor {
  const stackedY = floor.elevation + floor.height / 2
  if (floor.id === 'B1') {
    return {
      id: floor.id,
      x: BADGE_COLUMN_X - BADGE_WIDTH - 1.2,
      y: 1.5,
      z: BADGE_COLUMN_Z,
    }
  }
  return {
    id: floor.id,
    x: BADGE_COLUMN_X,
    y: stackedY,
    z: BADGE_COLUMN_Z,
  }
}

export function badgeBoxesOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width = BADGE_WIDTH,
  height = BADGE_HEIGHT,
): boolean {
  return Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < height
}
