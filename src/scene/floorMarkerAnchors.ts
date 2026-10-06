import { floorSpec } from '../data/floors'
import { TOWER_OUTLINE_OVERVIEW } from './shell/rings'
import { b1SlabOutline } from './stage/b1Plan'

export function floorMarkerOutline(id: string): Array<[number, number]> {
  return id === 'B1' ? b1SlabOutline() : TOWER_OUTLINE_OVERVIEW
}

export function floorMarkerMidY(id: string): number {
  const spec = floorSpec(id)
  const offset = window.__twinExplode?.floors.find((floor) => floor.id === id)?.offset ?? 0
  return spec.elevation + spec.height / 2 + offset
}

/** 该层外轮廓采样点，供引线选楼体外侧锚点。 */
export function floorMarkerWorldPoints(id: string): Array<[number, number, number]> {
  const y = floorMarkerMidY(id)
  return floorMarkerOutline(id).map(([x, z]) => [x, y, z])
}