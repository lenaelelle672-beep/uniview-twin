import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { finsAlong, podiumFocus, podiumFrontArc } from './massing'
import {
  PODIUM_ARC_FIN_DEPTH_M,
  PODIUM_ARC_FIN_SPACING_M,
  PODIUM_ARC_FIN_THICKNESS_M,
  podiumArcFinMaterial,
} from './podiumArcFins'

const here = dirname(fileURLToPath(import.meta.url))

describe('T144 裙房弧廊密肋', () => {
  it('加密间距，肋宽小于间距，避免融成实心板；实例数多于原 1.8 m 档', () => {
    expect(PODIUM_ARC_FIN_SPACING_M).toBeLessThanOrEqual(0.7)
    expect(PODIUM_ARC_FIN_SPACING_M).toBeGreaterThan(0)
    expect(PODIUM_ARC_FIN_THICKNESS_M).toBeGreaterThan(0.08)
    expect(PODIUM_ARC_FIN_THICKNESS_M).toBeLessThan(PODIUM_ARC_FIN_SPACING_M * 0.5)
    expect(PODIUM_ARC_FIN_DEPTH_M).toBeGreaterThan(0.28)
    const arc = podiumFrontArc()
    const focus = podiumFocus()
    const dense = finsAlong(arc, PODIUM_ARC_FIN_SPACING_M, focus, PODIUM_ARC_FIN_DEPTH_M * 0.45)
    const sparse = finsAlong(arc, 1.8, focus, 0.42 * 0.45)
    expect(dense.length).toBeGreaterThan(sparse.length * 2)
    expect(dense.length).toBeLessThan(400)
  })

  it('Podium 继续把 FinRow 挂在 podiumFrontArc 上，用有厚度的盒子和专用材质，不改共享 finMaterial', () => {
    const podium = readFileSync(join(here, '../components/scene/Podium.tsx'), 'utf8')
    expect(podium).toMatch(/<FinRow[\s\S]*points=\{arc\}/)
    expect(podium).toContain('spacing={PODIUM_ARC_FIN_SPACING_M}')
    expect(podium).toContain('depth={PODIUM_ARC_FIN_DEPTH_M}')
    expect(podium).toContain('thickness={PODIUM_ARC_FIN_THICKNESS_M}')
    expect(podium).toMatch(/<FinRow[\s\S]*\bbox\b/)
    expect(podium).toContain('material={podiumArcFinMaterial}')
    expect(podium).toContain('outwardFrom={focus}')
    expect(podium).not.toMatch(/EAST_CANTILEVER_M/)
    expect(podium).not.toMatch(/from '@react-three\/csg'|three-bvh-csg|three-fenestra/)
    expect(podiumArcFinMaterial.name).toBe('裙房弧廊密肋')
    const materials = readFileSync(join(here, 'materials.ts'), 'utf8')
    expect(materials).toMatch(/export const finMaterial[\s\S]*color: '#c5cad3'/)
    const fins = readFileSync(join(here, '../components/scene/Fins.tsx'), 'utf8')
    expect(fins).toContain('BoxGeometry')
    expect(fins).toContain('new PlaneGeometry(depth, height)')
  })
})
