import { describe, expect, it } from 'vitest'
import { getFloorPlan } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
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
import { CORE, MEETINGS, PANTRY, RECEPTION, type Aabb } from './layout'

hydrateFloorFromDisk('F12')

function distanceToAabb(x: number, z: number, box: Aabb): number {
  const closestX = Math.max(box.x0, Math.min(x, box.x1))
  const closestZ = Math.max(box.z0, Math.min(z, box.z1))
  return Math.hypot(x - closestX, z - closestZ)
}

describe('走廊折线', () => {
  const path = towerCorridorPolyline()

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

  it('F12 的 walkPaths 是闭合折线，条数不超过 12', () => {
    const plan = getFloorPlan('F12')!
    expect(plan.walkPaths.length).toBeGreaterThan(0)
    expect(plan.walkPaths.length).toBeLessThanOrEqual(12)
    for (const path of plan.walkPaths) {
      const points = path.map(([x, z]) => ({ x, z }))
      expect(pathLength(points)).toBeGreaterThan(8)
      const first = path[0]
      const last = path[path.length - 1]
      expect(first[0]).toBeCloseTo(last[0], 5)
      expect(first[1]).toBeCloseTo(last[1], 5)
    }
    const walls = [CORE, ...MEETINGS, PANTRY, RECEPTION]
    const legacy = samplePath(towerCorridorPolyline(), 0.2)
    for (const sample of legacy) {
      expect(sample.x).toBeGreaterThan(TOWER.minX + 0.8)
      expect(sample.x).toBeLessThan(TOWER.maxX - 0.8)
      expect(walls.some((wall) => distanceToAabb(sample.x, sample.z, wall) < 0)).toBe(false)
    }
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
