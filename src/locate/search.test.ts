import { describe, expect, it } from 'vitest'
import { createMockData } from '../data/mockData'
import { invalidPosMessage, resolveWorkstationRef, workstationIps } from './ref'
import { searchWorkstations } from './search'

describe('工位搜索', () => {
  const data = createMockData()

  it('按人名、工位号和 IP 模糊匹配，最多 10 条', () => {
    const person = data.people.find((item) => item.deskId === 'F12-66')
    expect(person).toBeTruthy()
    const byName = searchWorkstations(data, person!.name)
    expect(byName.length).toBeGreaterThan(0)
    expect(byName.length).toBeLessThanOrEqual(10)
    expect(byName.some((hit) => hit.deskId === 'F12-66' && hit.personName === person!.name)).toBe(true)

    const byDesk = searchWorkstations(data, 'f12-66')
    expect(byDesk[0]?.deskId).toBe('F12-66')

    const ips = workstationIps('F12', 'F12-66')
    expect(ips.pc).toBe('10.12.0.66')
    const byIp = searchWorkstations(data, ips.pc)
    expect(byIp[0]).toMatchObject({ deskId: 'F12-66', floorId: 'F12', pcIp: ips.pc })

    const fuzzy = searchWorkstations(data, '10.12.0.6')
    expect(fuzzy.length).toBeLessThanOrEqual(10)
    expect(fuzzy.some((hit) => hit.deskId === 'F12-66')).toBe(true)
    expect(searchWorkstations(data, '   ')).toEqual([])
  })

  it('非法工位号不能解析，合法编号能落到本层工位数', () => {
    expect(resolveWorkstationRef('F99-1')).toBeNull()
    expect(resolveWorkstationRef('F12-0')).toBeNull()
    expect(resolveWorkstationRef('F12-185')).toBeNull()
    expect(resolveWorkstationRef('F12-101')).toEqual({ floorId: 'F12', deskId: 'F12-101', index: 101 })
    expect(resolveWorkstationRef('F12-66')).toEqual({ floorId: 'F12', deskId: 'F12-66', index: 66 })
    expect(resolveWorkstationRef('B1-8')).toEqual({ floorId: 'B1', deskId: 'B1-8', index: 8 })
    expect(invalidPosMessage('F99-1')).toContain('找不到工位 F99-1')
  })
})