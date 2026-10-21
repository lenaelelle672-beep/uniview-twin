import { floorSpec } from '../data/floors'
import { TOWER_OUTLINE_BOUNDS, TOWER_OUTLINE_OVERVIEW, ringBounds } from './shell/rings'
import { basementPickOutline } from './stage/b1Plan'

export function floorMarkerOutline(id: string): Array<[number, number]> {
  return id === 'B1' ? basementPickOutline() : TOWER_OUTLINE_OVERVIEW
}

export function floorMarkerMidY(id: string): number {
  const spec = floorSpec(id)
  const offset = window.__twinExplode?.floors.find((floor) => floor.id === id)?.offset ?? 0
  if (spec.level < 0) return offset
  return spec.elevation + spec.height / 2 + offset
}

/** 楼体西侧外侧中点，引线从左侧列表过来不压南立面。 */
export function floorMarkerWorldPoints(id: string): Array<[number, number, number]> {
  const y = floorMarkerMidY(id)
  const ring = floorMarkerOutline(id)
  const bounds = id === 'B1' ? ringBounds(ring) : TOWER_OUTLINE_BOUNDS
  const west = bounds.minX - 1.8
  const midZ = (bounds.minZ + bounds.maxZ) / 2
  return [
    [west, y, midZ],
    [west, y, bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.35],
    [west, y, bounds.minZ + (bounds.maxZ - bounds.minZ) * 0.65],
    ...ring.map(([x, z]) => [x, y, z] as [number, number, number]),
  ]
}