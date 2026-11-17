import type { BufferGeometry } from 'three'

/** Poly Haven large_sandstone_blocks 物理边长，米。 */
export const STONE_TILE_M = 3

/** trimsheet 上下线脚约占 8%（约 0.24 m）。 */
const MOLD = 0.08
const MOLD_M = STONE_TILE_M * MOLD
const FIELD = 1 - 2 * MOLD

/**
 * 墙面 V（乘过边长，配合 repeat = 1/3）。
 * 底部/顶部各一段线脚，中间只平铺砌块区，避免线脚带每隔 3 m 出现一次。
 */
export function stoneWallV(y: number, height: number): number {
  if (height <= MOLD_M * 2) return (y / height) * STONE_TILE_M
  if (y <= MOLD_M) return (y / MOLD_M) * MOLD * STONE_TILE_M
  if (y >= height - MOLD_M) {
    const t = (y - (height - MOLD_M)) / MOLD_M
    return (1 - MOLD + t * MOLD) * STONE_TILE_M
  }
  const fieldM = STONE_TILE_M * FIELD
  const t = ((y - MOLD_M) % fieldM) / fieldM
  return (MOLD + t * FIELD) * STONE_TILE_M
}

function fieldV(along: number): number {
  const fieldM = STONE_TILE_M * FIELD
  const t = (((along % fieldM) + fieldM) % fieldM) / fieldM
  return (MOLD + t * FIELD) * STONE_TILE_M
}

/** 侧面 UV 以米计；顶面只用砌块区，避免线脚铺到悬挑台面上。 */
export function stampStoneWallUv(geometry: BufferGeometry, height: number): void {
  const uv = geometry.getAttribute('uv')
  const pos = geometry.getAttribute('position')
  if (!uv || !pos) return
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < uv.count; i += 1) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const nx = normal.getX(i)
    const ny = normal.getY(i)
    const nz = normal.getZ(i)
    // 丢掉的底面顶点法线为 0，跳过。顶面用法线识别，避免把墙顶边当成台面。
    if (nx === 0 && ny === 0 && nz === 0) continue
    if (Math.abs(ny) > 0.5) {
      uv.setXY(i, x, fieldV(-z))
      continue
    }
    const u = Math.abs(nx) >= Math.abs(nz) ? z : x
    uv.setXY(i, u, stoneWallV(y, height))
  }
  uv.needsUpdate = true
}
