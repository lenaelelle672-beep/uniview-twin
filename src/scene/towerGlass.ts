import type { BufferGeometry } from 'three'
import { TOWER_OUTLINE, TOWER_OUTLINE_OVERVIEW, type Ring } from './shell/rings'
import { createRingGlass } from './shell/facade'

export function createTowerGlass(
  elevation: number,
  height: number,
  ring: Ring = TOWER_OUTLINE_OVERVIEW,
): BufferGeometry {
  return createRingGlass(ring, elevation, height)
}

export function createFloorTowerGlass(elevation: number, height: number): BufferGeometry {
  return createRingGlass(TOWER_OUTLINE, elevation, height)
}
