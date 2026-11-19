import { TOWER_SEAM_WEST_X } from './shell/rings'

/** T146：只加密西翼。须明显密于南翼现用的 1.4 m，且不要改共享 finMaterial。 */
export const TOWER_WEST_FIN_SPACING_M = 0.58
/** 西翼用盒子肋，略加深，才能在总览 / p2f003 读出密肋，不改共享 finMaterial。 */
export const TOWER_WEST_FIN_DEPTH_M = 0.52
export const TOWER_WEST_FIN_THICKNESS_M = 0.11

/** 西翼在竖缝西墙及以西（含西墙本身）。 */
export function isTowerWestWingX(x: number): boolean {
  return x <= TOWER_SEAM_WEST_X + 1e-4
}

/**
 * 把闭合或开放折线按西翼切开。跨缝的边在西墙 x 处打断，
 * 避免北墙一条长边把两翼混在同一间距里。
 */
export function splitTowerFinLoops(loop: Array<[number, number]>): {
  west: Array<Array<[number, number]>>
  rest: Array<Array<[number, number]>>
} {
  const west: Array<Array<[number, number]>> = []
  const rest: Array<Array<[number, number]>> = []
  if (loop.length < 2) return { west, rest }

  const seam = TOWER_SEAM_WEST_X
  const edges: Array<{ a: [number, number]; b: [number, number]; west: boolean }> = []
  for (let i = 0; i < loop.length - 1; i += 1) {
    const a = loop[i]
    const b = loop[i + 1]
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-8) continue
    const aWest = isTowerWestWingX(a[0])
    const bWest = isTowerWestWingX(b[0])
    if (aWest === bWest || Math.abs(b[0] - a[0]) < 1e-8) {
      edges.push({ a, b, west: aWest && bWest ? true : aWest || bWest ? isTowerWestWingX((a[0] + b[0]) / 2) : false })
      continue
    }
    const t = (seam - a[0]) / (b[0] - a[0])
    const split: [number, number] = [seam, a[1] + t * (b[1] - a[1])]
    if (Math.hypot(split[0] - a[0], split[1] - a[1]) >= 1e-8) edges.push({ a, b: split, west: aWest })
    if (Math.hypot(b[0] - split[0], b[1] - split[1]) >= 1e-8) edges.push({ a: split, b, west: bWest })
  }

  let current: Array<[number, number]> = []
  let currentWest: boolean | null = null
  const flush = () => {
    if (current.length >= 2 && currentWest != null) {
      ;(currentWest ? west : rest).push(current)
    }
    current = []
    currentWest = null
  }
  edges.forEach((edge) => {
    if (currentWest == null) {
      current = [edge.a, edge.b]
      currentWest = edge.west
      return
    }
    if (edge.west !== currentWest) {
      flush()
      current = [edge.a, edge.b]
      currentWest = edge.west
      return
    }
    current.push(edge.b)
  })
  flush()
  return { west, rest }
}
