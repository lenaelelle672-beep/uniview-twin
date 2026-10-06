import { floorSpec } from '../../data/floors'
import { TOWER } from '../siteGeometry'

/** 与 Tower.makeBand 同一条 0.78 m 层间带。高亮 #f7eedd 在这条带上最干净。 */
export const HIGHLIGHT_BAND_M = 0.78

export function facadeBandY(elevation: number) {
  return elevation + HIGHLIGHT_BAND_M / 2
}

/** 南立面层间带中心，躲开西侧徽标列。 */
export function facadeBandZ() {
  return TOWER.maxZ + 0.14
}

export function facadeBandCorners(elevation: number, z = facadeBandZ(), x = 0) {
  const y = facadeBandY(elevation)
  const halfW = 1.6
  const halfH = HIGHLIGHT_BAND_M * 0.3
  return [
    { x: x - halfW, y: y - halfH, z },
    { x: x + halfW, y: y - halfH, z },
    { x: x - halfW, y: y + halfH, z },
    { x: x + halfW, y: y + halfH, z },
  ]
}

/** 选中层整片幕墙都是 #f7eedd。取玻璃中带，比层间缝更宽，三种宽度都打得中。 */
export function facadeGlassCorners(elevation: number, height: number, z = facadeBandZ(), x = 0) {
  const glassHeight = Math.max(height - HIGHLIGHT_BAND_M, 1)
  const y = elevation + HIGHLIGHT_BAND_M + glassHeight / 2
  const halfW = 4.2
  const halfH = glassHeight * 0.22
  return [
    { x: x - halfW, y: y - halfH, z },
    { x: x + halfW, y: y - halfH, z },
    { x: x - halfW, y: y + halfH, z },
    { x: x + halfW, y: y + halfH, z },
  ]
}

export function neighborFloorId(selectedId: string) {
  const spec = floorSpec(selectedId)
  if (spec.level <= 1) return 'F2'
  return `F${spec.level - 1}`
}

export function boxesOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function tightenNonOverlapping(
  selected: { x: number; y: number; w: number; h: number },
  neighbor: { x: number; y: number; w: number; h: number },
) {
  if (!boxesOverlap(selected, neighbor)) return { selected, neighbor }
  const gap = 2
  if (selected.y <= neighbor.y) {
    const mid = (selected.y + selected.h + neighbor.y) / 2
    const nextSelected = { ...selected, h: Math.max(4, mid - gap / 2 - selected.y) }
    const nextNeighbor = {
      ...neighbor,
      y: mid + gap / 2,
      h: Math.max(4, neighbor.y + neighbor.h - (mid + gap / 2)),
    }
    return { selected: nextSelected, neighbor: nextNeighbor }
  }
  const mid = (neighbor.y + neighbor.h + selected.y) / 2
  const nextNeighbor = { ...neighbor, h: Math.max(4, mid - gap / 2 - neighbor.y) }
  const nextSelected = {
    ...selected,
    y: mid + gap / 2,
    h: Math.max(4, selected.y + selected.h - (mid + gap / 2)),
  }
  return { selected: nextSelected, neighbor: nextNeighbor }
}
