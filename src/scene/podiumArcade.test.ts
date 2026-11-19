import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PODIUM_HEIGHT_M, podiumFocus, podiumFrontArc, podiumOutline } from './massing'
import {
  PODIUM_ARCADE_COLUMN_DEPTH_M,
  PODIUM_ARCADE_COLUMN_INSET_M,
  PODIUM_ARCADE_COLUMN_SPACING_M,
  PODIUM_ARCADE_COLUMN_W_M,
  PODIUM_ARCADE_HEIGHT_M,
  PODIUM_ARCADE_RECESS_M,
  podiumArcadeColumnMaterial,
  podiumArcadeColumns,
  podiumArcadeGlassOutline,
  podiumLowerOutline,
} from './podiumArcade'
import { PODIUM_ARC_FIN_SPACING_M } from './podiumArcFins'

const here = dirname(fileURLToPath(import.meta.url))

describe('T145 裙房弧廊下层架空长廊', () => {
  it('下层高度明显低于通高，退后距离可读，柱距宽于密肋', () => {
    expect(PODIUM_ARCADE_HEIGHT_M).toBeGreaterThan(4.5)
    expect(PODIUM_ARCADE_HEIGHT_M).toBeLessThan(PODIUM_HEIGHT_M * 0.5)
    expect(PODIUM_ARCADE_RECESS_M).toBeGreaterThan(2.5)
    expect(PODIUM_ARCADE_COLUMN_SPACING_M).toBeGreaterThan(PODIUM_ARC_FIN_SPACING_M * 8)
    expect(PODIUM_ARCADE_COLUMN_W_M).toBeGreaterThan(0.5)
    expect(PODIUM_ARCADE_COLUMN_DEPTH_M).toBeGreaterThan(0.5)
    expect(PODIUM_ARCADE_COLUMN_INSET_M).toBeGreaterThan(0.3)
    expect(PODIUM_ARCADE_COLUMN_INSET_M).toBeLessThan(PODIUM_ARCADE_RECESS_M)
  })

  it('下层轮廓只退后广场凹弧，其余外皮与原 outline 重合', () => {
    const original = podiumOutline()
    const lower = podiumLowerOutline()
    const arc = podiumFrontArc()
    expect(lower.length).toBe(original.length)
    let moved = 0
    let stayed = 0
    original.forEach((point, index) => {
      const next = lower[index]
      const dist = Math.hypot(next[0] - point[0], next[1] - point[1])
      const onArc = arc.some(([x, z]) => Math.hypot(x - point[0], z - point[1]) <= 0.08)
      if (onArc) {
        expect(dist).toBeGreaterThan(PODIUM_ARCADE_RECESS_M - 0.15)
        expect(dist).toBeLessThan(PODIUM_ARCADE_RECESS_M + 0.15)
        const focus = podiumFocus()
        const inward =
          (point[0] - next[0]) * (point[0] - focus[0]) + (point[1] - next[1]) * (point[1] - focus[1])
        expect(inward).toBeGreaterThan(0)
        moved += 1
      } else {
        expect(dist).toBeLessThan(1e-6)
        stayed += 1
      }
    })
    expect(moved).toBeGreaterThan(8)
    expect(stayed).toBeGreaterThan(8)
  })

  it('玻璃薄墙沿退后弧，柱列沿原外弧向内收，数量可读', () => {
    const glass = podiumArcadeGlassOutline()
    expect(glass.length).toBeGreaterThan(20)
    const columns = podiumArcadeColumns()
    expect(columns.length).toBeGreaterThan(6)
    expect(columns.length).toBeLessThan(20)
    const focus = podiumFocus()
    const arc = podiumFrontArc()
    const footOf = (x: number, z: number): { d: number; fx: number; fz: number } => {
      let best = { d: Infinity, fx: x, fz: z }
      for (let i = 0; i < arc.length - 1; i += 1) {
        const [ax, az] = arc[i]
        const [bx, bz] = arc[i + 1]
        const dx = bx - ax
        const dz = bz - az
        const len2 = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
        const fx = ax + dx * t
        const fz = az + dz * t
        const d = Math.hypot(x - fx, z - fz)
        if (d < best.d) best = { d, fx, fz }
      }
      return best
    }
    columns.forEach((column) => {
      const foot = footOf(column.x, column.z)
      expect(foot.d).toBeGreaterThan(PODIUM_ARCADE_COLUMN_INSET_M - 0.15)
      expect(foot.d).toBeLessThan(PODIUM_ARCADE_COLUMN_INSET_M + 0.15)
      const colR2 = (column.x - focus[0]) ** 2 + (column.z - focus[1]) ** 2
      const footR2 = (foot.fx - focus[0]) ** 2 + (foot.fz - focus[1]) ** 2
      expect(colR2).toBeLessThan(footR2)
    })
    expect(podiumArcadeColumnMaterial.name).toBe('裙房弧廊柱')
  })

  it('Podium 把密肋收到上段，下层用挤出退后 + 玻璃 + InstancedMesh 柱列，不重开 T144 / T134', () => {
    const podium = readFileSync(join(here, '../components/scene/Podium.tsx'), 'utf8')
    expect(podium).toContain('podiumLowerOutline')
    expect(podium).toContain('podiumArcadeGlassOutline')
    expect(podium).toContain('PodiumArcadeColumns')
    expect(podium).toContain('curtainMaterial')
    expect(podium).toContain('PODIUM_ARCADE_HEIGHT_M')
    expect(podium).toContain('y={arcadeTop + upperHeight / 2}')
    expect(podium).toContain('height={upperHeight * 0.92}')
    expect(podium).not.toMatch(/y=\{PODIUM_HEIGHT_M \/ 2\}/)
    expect(podium).not.toMatch(/height=\{PODIUM_HEIGHT_M \* 0\.92\}/)
    expect(podium).toContain('spacing={PODIUM_ARC_FIN_SPACING_M}')
    expect(podium).toContain('depth={PODIUM_ARC_FIN_DEPTH_M}')
    expect(podium).toContain('thickness={PODIUM_ARC_FIN_THICKNESS_M}')
    expect(podium).toMatch(/<FinRow[\s\S]*\bbox\b/)
    expect(podium).toContain('material={podiumArcFinMaterial}')
    expect(podium).toContain('position={[0, PODIUM_HEIGHT_M - 1, 0]}')
    expect(podium).not.toMatch(/EAST_CANTILEVER_M/)
    expect(podium).not.toMatch(/from '@react-three\/csg'|three-bvh-csg|three-fenestra|transmission/)
    expect(podium).not.toMatch(/MeshReflectorMaterial/)
    const materials = readFileSync(join(here, 'materials.ts'), 'utf8')
    expect(materials).toMatch(/export const finMaterial[\s\S]*color: '#c5cad3'/)
  })
})
