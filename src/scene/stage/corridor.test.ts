import { describe, expect, it } from 'vitest'
import { DESKS_PER_FLOOR } from '../../data/mockData'
import { TOWER } from '../siteGeometry'
import {
  CORRIDOR_PEOPLE_COUNT,
  corridorRoster,
  pathLength,
  pointOnPath,
  samplePath,
  showCorridorPeople,
  towerCorridorPolyline,
} from './corridor'
import { CORE, MEETINGS, PANTRY, RECEPTION, layoutWorkstations, towerColumns, type Aabb } from './layout'

function distanceToAabb(x: number, z: number, box: Aabb): number {
  const closestX = Math.max(box.x0, Math.min(x, box.x1))
  const closestZ = Math.max(box.z0, Math.min(z, box.z1))
  return Math.hypot(x - closestX, z - closestZ)
}

function distanceToRect(x: number, z: number, x0: number, x1: number, z0: number, z1: number): number {
  const closestX = Math.max(x0, Math.min(x, x1))
  const closestZ = Math.max(z0, Math.min(z, z1))
  return Math.hypot(x - closestX, z - closestZ)
}

describe('走廊折线', () => {
  const path = towerCorridorPolyline()
  const samples = samplePath(path, 0.2)

  it('闭合、够长，并且人数不超过 12', () => {
    expect(path.length).toBeGreaterThanOrEqual(4)
    expect(pathLength(path)).toBeGreaterThan(80)
    const roster = corridorRoster()
    expect(roster).toHaveLength(CORRIDOR_PEOPLE_COUNT)
    expect(roster.filter((person) => person.model === 'man')).toHaveLength(6)
    expect(roster.filter((person) => person.model === 'woman')).toHaveLength(6)
    expect(new Set(roster.map((person) => person.offset)).size).toBe(CORRIDOR_PEOPLE_COUNT)
    expect(showCorridorPeople('perf')).toBe(false)
    expect(showCorridorPeople('balanced')).toBe(true)
    expect(showCorridorPeople('high')).toBe(true)
  })

  it('采样点留在楼板内，并和桌子、墙、柱子保持距离', () => {
    const walls = [CORE, ...MEETINGS, PANTRY, RECEPTION]
    const desks = layoutWorkstations('F12', DESKS_PER_FLOOR)
    const columns = towerColumns()
    expect(desks).toHaveLength(DESKS_PER_FLOOR)
    let deskGap = Infinity
    let chairGap = Infinity
    let wallGap = Infinity
    let columnGap = Infinity

    for (const sample of samples) {
      expect(sample.x).toBeGreaterThan(TOWER.minX + 0.8)
      expect(sample.x).toBeLessThan(TOWER.maxX - 0.8)
      expect(sample.z).toBeGreaterThan(TOWER.minZ + 0.8)
      expect(sample.z).toBeLessThan(TOWER.maxZ - 0.8)
      for (const desk of desks) {
        deskGap = Math.min(deskGap, distanceToRect(sample.x, sample.z, desk.x - 0.7, desk.x + 0.7, desk.z - 0.35, desk.z + 0.35))
        chairGap = Math.min(
          chairGap,
          distanceToRect(sample.x, sample.z, desk.x - 0.26, desk.x + 0.26, desk.z + 0.38, desk.z + 0.92),
        )
      }
      for (const wall of walls) wallGap = Math.min(wallGap, distanceToAabb(sample.x, sample.z, wall))
      for (const column of columns) {
        columnGap = Math.min(
          columnGap,
          distanceToRect(sample.x, sample.z, column.x - 0.31, column.x + 0.31, column.z - 0.31, column.z + 0.31),
        )
      }
    }

    expect(deskGap).toBeGreaterThan(0.35)
    expect(chairGap).toBeGreaterThan(0.3)
    expect(wallGap).toBeGreaterThan(0.45)
    expect(columnGap).toBeGreaterThan(0.28)
  })

  it('沿折线插值落在折线上，朝向跟着切线', () => {
    const east = pointOnPath(path, 4)
    expect(east.z).toBeCloseTo(path[0].z, 5)
    expect(east.heading).toBeCloseTo(Math.PI / 2, 5)
    const length = pathLength(path)
    const wrapped = pointOnPath(path, length + 1.5)
    const direct = pointOnPath(path, 1.5)
    expect(wrapped.x).toBeCloseTo(direct.x, 5)
    expect(wrapped.z).toBeCloseTo(direct.z, 5)
  })
})
