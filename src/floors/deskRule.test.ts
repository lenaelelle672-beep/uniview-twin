import { describe, expect, it } from 'vitest'
import { getFloorPlan } from './cache'
import { hydrateAllAboveGrade } from './hydrateForTests'
import { COLUMN_EDGE_CLEAR_M } from '../scene/stage/layout'

hydrateAllAboveGrade()

describe('柱距违规清单（照图保留）', () => {
  it('列出中心到柱边不足 1.10 m 的工位，不自行挪动', () => {
    const rows: Array<{ floorId: string; desk: string; column: string; dist: number }> = []
    for (let level = 1; level <= 22; level += 1) {
      const floorId = `F${level}`
      const plan = getFloorPlan(floorId)!
      for (const desk of plan.desks) {
        if (desk.colEdgeDist_m + 1e-9 < COLUMN_EDGE_CLEAR_M) {
          rows.push({
            floorId,
            desk: desk.id,
            column: desk.nearestColumn ?? '?',
            dist: desk.colEdgeDist_m,
          })
        }
      }
      const listed = new Set(plan.deskRule.violations.map((item) => item.desk))
      for (const hit of plan.deskRule.violations) {
        expect(hit.centreToColumnEdge_m).toBeLessThan(COLUMN_EDGE_CLEAR_M)
        expect(listed.has(hit.desk)).toBe(true)
      }
    }
    const byFloor = new Map<string, number>()
    for (const row of rows) byFloor.set(row.floorId, (byFloor.get(row.floorId) ?? 0) + 1)
    expect(byFloor.get('F4')).toBe(14)
    expect(byFloor.get('F5')).toBe(12)
    expect(byFloor.get('F6')).toBe(14)
    expect(byFloor.get('F7')).toBe(19)
    expect(byFloor.get('F8')).toBe(7)
    expect(byFloor.get('F18')).toBe(1)
    expect(byFloor.get('F21')).toBe(1)
    expect(byFloor.get('F12') ?? 0).toBe(0)
    expect(byFloor.get('F13') ?? 0).toBe(0)
  })
})
