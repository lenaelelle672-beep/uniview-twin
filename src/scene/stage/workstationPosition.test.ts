import { describe, expect, it } from 'vitest'
import { floorDeskCount } from '../../floors/deskCounts'
import { hydrateAllAboveGrade } from '../../floors/hydrateForTests'
import { pointInRing } from '../../floors/parsePlan'
import { getFloorPlan } from '../../floors/cache'
import { floorIdList, floorSpec } from '../../data/floors'
import { createMockData } from '../../data/mockData'
import { TOWER } from '../siteGeometry'
import { pointInB1Slab } from './b1Plan'
import { WORKSTATIONS_PER_FLOOR, workstationPosition, workstationsOnFloor } from './workstationPosition'

hydrateAllAboveGrade()

function insideSlab(floorId: string, x: number, z: number): boolean {
  if (floorId === 'B1') return pointInB1Slab(x, z)
  const plan = getFloorPlan(floorId)
  if (plan) return pointInRing(x, z, plan.outline)
  return x > TOWER.minX && x < TOWER.maxX && z > TOWER.minZ && z < TOWER.maxZ
}

describe('workstationPosition', () => {
  it('每层都能按图纸工位数得到位置', () => {
    for (const floorId of floorIdList()) {
      const count = workstationsOnFloor(floorId)
      const positions = Array.from({ length: count }, (_, index) => workstationPosition(floorId, `${floorId}-${index + 1}`))
      expect(positions).toHaveLength(count)
      const keys = new Set(positions.map((position) => `${position.x},${position.z}`))
      expect(keys.size).toBe(count)
      expect(positions.every((position) => position.y === floorSpec(floorId).elevation)).toBe(true)
    }
    expect(workstationsOnFloor('B1')).toBe(WORKSTATIONS_PER_FLOOR)
    expect(workstationsOnFloor('F12')).toBe(184)
    expect(workstationsOnFloor('F1')).toBe(floorDeskCount('F1'))
  })

  it('所有位置都落在该层楼板轮廓以内', () => {
    for (const floorId of floorIdList()) {
      const count = workstationsOnFloor(floorId)
      for (let index = 1; index <= count; index += 1) {
        const position = workstationPosition(floorId, `${floorId}-${index}`)
        expect(insideSlab(floorId, position.x, position.z)).toBe(true)
      }
    }
  })

  it('同样的输入永远得到同样的结果', () => {
    const first = floorIdList().flatMap((floorId) =>
      Array.from({ length: workstationsOnFloor(floorId) }, (_, index) => workstationPosition(floorId, `${floorId}-${index + 1}`)),
    )
    const second = floorIdList().flatMap((floorId) =>
      Array.from({ length: workstationsOnFloor(floorId) }, (_, index) => workstationPosition(floorId, `${floorId}-${index + 1}`)),
    )
    expect(second).toEqual(first)
    expect(workstationPosition('F12', 'F12-66')).toEqual(workstationPosition('F12', 'F12-66'))
  })

  it('不采用数据里自带的坐标', () => {
    const desk = createMockData().desks.find((item) => item.id === 'F12-1')
    expect(desk).toBeDefined()
    const position = workstationPosition('F12', 'F12-1')
    expect(position.z).not.toBe(desk?.z)
    expect(position.y).toBe(floorSpec('F12').elevation)
  })

  it('地上层工位朝向来自图纸 rotY', () => {
    const slot = workstationPosition('F12', 'F12-1')
    expect(slot.rot).toBeCloseTo(-Math.PI / 2, 3)
  })
})
