import { floorSpec, isFloorId } from '../data/floors'
import { TOWER_OUTLINE_BOUNDS } from '../scene/shell/rings'
import type { Viewpoint } from '../url/viewpoint'

/** 与单层取景同一档视场。数字写在这里，避免导览包去引用单层相机模块。 */
const TOUR_FOV = 48

export function alarmFloorIds(
  floors: readonly { id: string; level: number; alarmCount: number }[],
): string[] {
  return floors
    .filter((floor) => floor.alarmCount > 0 && isFloorId(floor.id))
    .slice()
    .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id))
    .map((floor) => floor.id)
}

/**
 * 站在塔楼东南、略高于该层看向楼心。
 * 进层后爆炸偏移会回到 0，所以这里用静止标高。
 * 距离落在现有 min/max 内，不改镜头限制。
 */
export function floorTourPose(floorId: string): Viewpoint {
  const spec = floorSpec(floorId)
  const cx = (TOWER_OUTLINE_BOUNDS.minX + TOWER_OUTLINE_BOUNDS.maxX) / 2
  const cz = (TOWER_OUTLINE_BOUNDS.minZ + TOWER_OUTLINE_BOUNDS.maxZ) / 2
  const ty = spec.elevation + spec.height * 0.45
  return {
    px: cx + 28,
    py: ty + 12,
    pz: cz + 48,
    tx: cx,
    ty,
    tz: cz,
    fov: TOUR_FOV,
    fx: 0,
    fy: 0,
    fz: 0,
  }
}
