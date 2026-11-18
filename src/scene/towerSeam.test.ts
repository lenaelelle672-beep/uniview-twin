import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TOWER_OUTLINE,
  TOWER_OUTLINE_OVERVIEW,
  TOWER_SEAM_BACK_Z,
  TOWER_SEAM_EAST_X,
  TOWER_SEAM_SOUTH_Z,
  TOWER_SEAM_WEST_X,
} from './shell/rings'
import {
  TOWER_SEAM_LINER_INSET_M,
  TOWER_SEAM_LINER_MOUTH_M,
  towerSeamLinerTransform,
} from './towerSeam'

const here = dirname(fileURLToPath(import.meta.url))

describe('T143 西南竖缝再加深', () => {
  it('单环凹槽加宽到 6 m、加深到 z=-12，南立面两翼仍在 z=17.1003', () => {
    expect(TOWER_SEAM_EAST_X - TOWER_SEAM_WEST_X).toBeCloseTo(6, 3)
    expect(TOWER_SEAM_BACK_Z).toBeCloseTo(-12, 3)
    expect(TOWER_SEAM_SOUTH_Z).toBeCloseTo(17.1003, 4)
    for (const ring of [TOWER_OUTLINE_OVERVIEW, TOWER_OUTLINE]) {
      const south = ring.filter(([, z]) => Math.abs(z - TOWER_SEAM_SOUTH_Z) < 1e-4)
      expect(Math.min(...south.map(([x]) => x))).toBeCloseTo(-31.3093, 3)
      expect(Math.max(...south.map(([x]) => x))).toBeCloseTo(-3.5469, 3)
      expect(south.some(([x]) => Math.abs(x - TOWER_SEAM_WEST_X) < 1e-4)).toBe(true)
      expect(south.some(([x]) => Math.abs(x - TOWER_SEAM_EAST_X) < 1e-4)).toBe(true)
      expect(ring.some(([x, z]) => Math.abs(x - TOWER_SEAM_WEST_X) < 1e-4 && Math.abs(z - TOWER_SEAM_BACK_Z) < 1e-4)).toBe(
        true,
      )
      expect(ring.some(([x, z]) => Math.abs(x - TOWER_SEAM_EAST_X) < 1e-4 && Math.abs(z - TOWER_SEAM_BACK_Z) < 1e-4)).toBe(
        true,
      )
    }
  })

  it('内衬落在槽内，南向留开口，不超出两翼南缘', () => {
    const { position, size } = towerSeamLinerTransform(10, 4)
    const [cx, cy, cz] = position
    const [w, h, d] = size
    expect(w).toBeCloseTo(6 - TOWER_SEAM_LINER_INSET_M * 2, 5)
    expect(h).toBeCloseTo(4, 5)
    expect(cy).toBeCloseTo(12, 5)
    const south = cz + d / 2
    const north = cz - d / 2
    expect(south).toBeCloseTo(TOWER_SEAM_SOUTH_Z - TOWER_SEAM_LINER_MOUTH_M, 5)
    expect(north).toBeCloseTo(TOWER_SEAM_BACK_Z + TOWER_SEAM_LINER_INSET_M, 5)
    expect(south).toBeLessThan(TOWER_SEAM_SOUTH_Z)
    expect(cx - w / 2).toBeGreaterThan(TOWER_SEAM_WEST_X)
    expect(cx + w / 2).toBeLessThan(TOWER_SEAM_EAST_X)
  })

  it('楼层外壳与屋顶都挂内衬，切开/隐藏楼层时随 FloorShell 卸掉', () => {
    const tower = readFileSync(join(here, '../components/scene/Tower.tsx'), 'utf8')
    expect(tower).toContain('name="TowerSeamLiner"')
    expect(tower).toContain('towerSeamLinerTransform(elevation, height)')
    expect(tower).toContain('<SeamLiner elevation={elevation} height={height} />')
    expect(tower).toContain('elevation={TOWER_ROOF_M - 0.35}')
    expect(tower).not.toMatch(/from '@react-three\/csg'|three-bvh-csg|web-ifc|three-fenestra/)
    expect(tower).not.toMatch(/MeshReflector|transmission|SSGI|pathtracer/)
  })
})
