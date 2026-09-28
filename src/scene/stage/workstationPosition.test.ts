import { describe, expect, it } from 'vitest'
import { floorIdList, floorSpec } from '../../data/floors'
import { createMockData } from '../../data/mockData'
import { FOOTPRINT, TOWER } from '../siteGeometry'
import { WORKSTATIONS_PER_FLOOR, workstationPosition } from './workstationPosition'

function insideSlab(floorId: string, x: number, z: number): boolean {
  const slab = floorId === 'B1' ? FOOTPRINT : TOWER
  return x > slab.minX && x < slab.maxX && z > slab.minZ && z < slab.maxZ
}

describe('workstationPosition', () => {
  it('每层都能得到 100 个位置', () => {
    for (const floorId of floorIdList()) {
      const positions = Array.from({ length: WORKSTATIONS_PER_FLOOR }, (_, index) =>
        workstationPosition(floorId, `${floorId}-${index + 1}`),
      )
      expect(positions).toHaveLength(100)
      const keys = new Set(positions.map((position) => `${position.x},${position.z}`))
      expect(keys.size).toBe(100)
      expect(positions.every((position) => position.y === floorSpec(floorId).elevation)).toBe(true)
    }
  })

  it('所有位置都落在该层楼板轮廓以内', () => {
    for (const floorId of floorIdList()) {
      for (let index = 1; index <= WORKSTATIONS_PER_FLOOR; index += 1) {
        const position = workstationPosition(floorId, `${floorId}-${index}`)
        expect(insideSlab(floorId, position.x, position.z)).toBe(true)
      }
    }
  })

  it('同样的输入永远得到同样的结果', () => {
    const first = floorIdList().flatMap((floorId) =>
      Array.from({ length: WORKSTATIONS_PER_FLOOR }, (_, index) =>
        workstationPosition(floorId, `${floorId}-${index + 1}`),
      ),
    )
    const second = floorIdList().flatMap((floorId) =>
      Array.from({ length: WORKSTATIONS_PER_FLOOR }, (_, index) =>
        workstationPosition(floorId, `${floorId}-${index + 1}`),
      ),
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
})
