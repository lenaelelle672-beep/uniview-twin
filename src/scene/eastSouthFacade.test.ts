import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BoxGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { EAST_CANTILEVER_M, EAST_CANTILEVER_SOFFIT_T_M, EAST_LOWER_TOP_M, EAST_ROOF_M, EAST_UPPER_EAST_INSET_M, eastUpperOutline, finsAlong } from './massing'
import { EAST_FACE_X, EAST_SOUTH_GLASS_Z, EAST_SOUTH_LENGTH_M } from './shell/rings'
import {
  EAST_SOUTH_FIN_DEPTH_M,
  EAST_SOUTH_FIN_SPACING_M,
  EAST_SOUTH_FIN_THICKNESS_M,
  EAST_SOUTH_GLASS_T_M,
  eastSouthFinMaterial,
  eastSouthGlassPose,
  eastSouthInward,
  eastSouthUpperLine,
  eastUpperSolidOutline,
} from './eastSouthFacade'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string) {
  return readFileSync(join(here, relative), 'utf8')
}

describe('T147 东楼南立面密肋玻璃上段', () => {
  it('密肋间距严于西弧 1.6 m，肋宽小于间距，实例明显更密', () => {
    expect(EAST_SOUTH_FIN_SPACING_M).toBeLessThan(1.6)
    expect(EAST_SOUTH_FIN_SPACING_M).toBeGreaterThan(0.45)
    expect(EAST_SOUTH_FIN_THICKNESS_M).toBeGreaterThan(0.06)
    expect(EAST_SOUTH_FIN_THICKNESS_M).toBeLessThan(EAST_SOUTH_FIN_SPACING_M * 0.5)
    expect(EAST_SOUTH_FIN_DEPTH_M).toBeGreaterThan(0.35)
    const line = eastSouthUpperLine()
    const inward = eastSouthInward()
    const dense = finsAlong(line, EAST_SOUTH_FIN_SPACING_M, inward, EAST_SOUTH_FIN_DEPTH_M * 0.45)
    const sparse = finsAlong(line, 1.6, inward, 0.42 * 0.45)
    expect(dense.length).toBeGreaterThan(sparse.length * 2)
    expect(dense.length).toBeGreaterThan(70)
    expect(dense.length).toBeLessThan(200)
    expect(dense.every((fin) => fin.z > EAST_SOUTH_GLASS_Z)).toBe(true)
  })

  it('上层南皮从实心盒分开，外皮仍在南玻璃线，不改 eastUpperOutline 与悬挑常数', () => {
    expect(EAST_CANTILEVER_M).toBe(4)
    expect(EAST_CANTILEVER_SOFFIT_T_M).toBe(0.7)
    expect(EAST_SOUTH_GLASS_T_M).toBeGreaterThan(0.2)
    expect(EAST_SOUTH_GLASS_T_M).toBeLessThan(0.8)
    const upper = eastUpperOutline()
    const solid = eastUpperSolidOutline()
    expect(Math.max(...upper.map(([, z]) => z))).toBeCloseTo(EAST_SOUTH_GLASS_Z, 5)
    expect(Math.max(...solid.map(([, z]) => z))).toBeCloseTo(EAST_SOUTH_GLASS_Z - EAST_SOUTH_GLASS_T_M, 5)
    expect(solid).toHaveLength(upper.length)
    upper.forEach(([x, z], i) => {
      expect(solid[i][0]).toBeCloseTo(x, 5)
      if (z > 111.5) expect(solid[i][1]).toBeCloseTo(z - EAST_SOUTH_GLASS_T_M, 5)
      else expect(solid[i][1]).toBeCloseTo(z, 5)
    })
    const pose = eastSouthGlassPose()
    expect(pose.size[0]).toBeCloseTo(EAST_SOUTH_LENGTH_M - EAST_UPPER_EAST_INSET_M, 5)
    expect(pose.size[1]).toBeCloseTo(EAST_ROOF_M - EAST_LOWER_TOP_M, 5)
    expect(pose.size[2]).toBeCloseTo(EAST_SOUTH_GLASS_T_M, 5)
    expect(pose.position[2] + pose.size[2] / 2).toBeCloseTo(EAST_SOUTH_GLASS_Z, 5)
    expect(pose.position[2] - pose.size[2] / 2).toBeCloseTo(EAST_SOUTH_GLASS_Z - EAST_SOUTH_GLASS_T_M, 5)
    const box = new BoxGeometry(...pose.size)
    box.translate(...pose.position)
    box.computeBoundingBox()
    const bounds = box.boundingBox
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.max.x).toBeCloseTo(EAST_FACE_X - EAST_UPPER_EAST_INSET_M, 4)
      expect(bounds.min.x).toBeCloseTo(EAST_FACE_X - EAST_SOUTH_LENGTH_M, 4)
      expect(bounds.min.y).toBeCloseTo(EAST_LOWER_TOP_M, 4)
      expect(bounds.max.y).toBeCloseTo(EAST_ROOF_M, 4)
      expect(bounds.max.z).toBeCloseTo(EAST_SOUTH_GLASS_Z, 4)
    }
    box.dispose()
  })

  it('EastBlock 上层挤出改走分体轮廓，玻璃直接用 curtainMaterial，西弧 FinRow 与共享材质不改', () => {
    const east = read('../components/scene/EastBlock.tsx')
    expect(east).toMatch(/extrudeUp\(upperSolidOutline/)
    expect(east).toMatch(/eastUpperSolidOutline\(\)/)
    expect(east).toMatch(/eastSouthGlassPose\(\)/)
    expect(east).toMatch(/name="EastSouthFacadeGlass"/)
    expect(east).toMatch(/model \? solidMaterial : curtainMaterial/)
    expect(east).toMatch(/points=\{curve\}/)
    expect(east).toContain('spacing={1.6}')
    expect(east).toMatch(/!model && <EastGrille/)
    expect(east).toMatch(/EastFacadeBands/)
    expect(east).not.toMatch(/EastUpperGrilleFins/)
    expect(east).not.toMatch(/EAST_CANTILEVER_M\s*=/)
    expect(east).not.toMatch(/from '@react-three\/csg'|three-bvh-csg|three-fenestra/)
    expect(east).not.toMatch(/transmission|SSGI|pathtracer|MeshReflector/)
    expect(east).not.toMatch(/stoneUv|TreeLod/)
  })

  it('南墙密肋改一改用 FinRow，晚载 OUT hardGate，不搬东立面组件，不改共享 finMaterial', () => {
    const fins = read('../components/scene/EastSouthFacadeFins.tsx')
    expect(fins).toMatch(/import \{ FinRow \} from '\.\/Fins'/)
    expect(fins).toContain('points={points}')
    expect(fins).toContain('spacing={EAST_SOUTH_FIN_SPACING_M}')
    expect(fins).toContain('depth={EAST_SOUTH_FIN_DEPTH_M}')
    expect(fins).toContain('thickness={EAST_SOUTH_FIN_THICKNESS_M}')
    expect(fins).toMatch(/<FinRow[\s\S]*\bbox\b/)
    expect(fins).toContain('material={eastSouthFinMaterial}')
    expect(fins).not.toMatch(/EastGrille|EastUpperGrilleFins|eastFacadeBands|eastFacadeLine/)
    expect(fins).not.toMatch(/finMaterial/)
    expect(fins).not.toMatch(/transmission|SSGI|pathtracer|MeshReflector/)
    expect(fins).not.toMatch(/from '@react-three\/csg'|three-bvh-csg|three-fenestra/)
    expect(eastSouthFinMaterial.name).toBe('东楼南墙密肋')
    const materials = read('./materials.ts')
    expect(materials).toMatch(/color: '#c5cad3'/)
    expect(materials).toMatch(/curtainMaterial\.name = '幕墙'/)
    expect(materials).toMatch(/color: '#7d93a8'/)
    expect(materials).not.toMatch(/EAST_SOUTH_FIN|eastSouthFinMaterial|EastSouthFacade/)
    const massing = read('./massing.ts')
    expect(massing).toMatch(/export \{ EAST_CANTILEVER_M \}/)
    expect(massing).not.toMatch(/eastUpperSolidOutline|EAST_SOUTH_GLASS_T_M/)
    const site = read('./siteGeometry.ts')
    expect(site).toMatch(/export const EAST_CANTILEVER_M = 4/)
  })
})
