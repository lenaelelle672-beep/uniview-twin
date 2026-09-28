import { describe, expect, it } from 'vitest'
import { MockAdapter } from './adapters'
import { floorIdList, TOWER_ROOF_M } from './floors'
import { ALARM_HEAVY_FLOORS, createMockData, DESKS_PER_FLOOR } from './mockData'
import type { DeviceStatus } from '../types'

const ALL_STATUSES = new Set<DeviceStatus>(['online', 'idle', 'alarm', 'offline'])

describe('MockAdapter', () => {
  it('用固定种子生成 B1 与 F1～F22，两次结果完全相同', async () => {
    const first = createMockData()
    const second = createMockData()
    expect(second).toEqual(first)

    const fromAdapter = await new MockAdapter().load()
    const again = await new MockAdapter().load()
    expect(again).toEqual(fromAdapter)
    expect(fromAdapter).toEqual(first)
  })

  it('每层约 100 个工位，并带齐四种设备状态', () => {
    const data = createMockData()
    expect(data.floors.map((floor) => floor.id)).toEqual(floorIdList())
    expect(data.floors).toHaveLength(23)

    for (const floor of data.floors) {
      const desks = data.desks.filter((desk) => desk.floorId === floor.id)
      const devices = data.devices.filter((device) => device.floorId === floor.id)
      const people = data.people.filter((person) => person.floorId === floor.id)
      expect(desks).toHaveLength(DESKS_PER_FLOOR)
      expect(people).toHaveLength(DESKS_PER_FLOOR)
      expect(devices.filter((device) => device.type === 'pc')).toHaveLength(DESKS_PER_FLOOR)
      expect(devices.filter((device) => device.type === 'phone')).toHaveLength(DESKS_PER_FLOOR)
      expect(devices.filter((device) => device.type === 'printer')).toHaveLength(2)
      const cameras = devices.filter((device) => device.type === 'camera')
      expect(cameras.length).toBeGreaterThanOrEqual(4)
      expect(cameras.length).toBeLessThanOrEqual(6)
      expect(new Set(devices.map((device) => device.status))).toEqual(ALL_STATUSES)
      expect(floor.alarmCount).toBe(devices.filter((device) => device.status === 'alarm').length)
      expect(floor.offlineCount).toBe(devices.filter((device) => device.status === 'offline').length)

      const heavy = (ALARM_HEAVY_FLOORS as readonly string[]).includes(floor.id)
      const idle = devices.filter((device) => device.status === 'idle').length / devices.length
      expect(idle).toBeGreaterThan(0.12)
      expect(idle).toBeLessThan(0.18)
      if (!heavy) {
        expect(floor.alarmCount).toBeGreaterThanOrEqual(5)
        expect(floor.alarmCount).toBeLessThanOrEqual(11)
        expect(floor.offlineCount).toBeGreaterThanOrEqual(7)
        expect(floor.offlineCount).toBeLessThanOrEqual(17)
      }
    }

    const normal = data.floors.filter((floor) => !(ALARM_HEAVY_FLOORS as readonly string[]).includes(floor.id))
    const heavy = data.floors.filter((floor) => (ALARM_HEAVY_FLOORS as readonly string[]).includes(floor.id))
    const maxNormalAlarm = Math.max(...normal.map((floor) => floor.alarmCount))
    expect(new Set(normal.map((floor) => floor.alarmCount)).size).toBeGreaterThan(1)
    expect(new Set(normal.map((floor) => floor.offlineCount)).size).toBeGreaterThan(1)
    for (const floor of heavy) {
      expect(floor.alarmCount).toBeGreaterThanOrEqual(maxNormalAlarm + 4)
    }
  })

  it('工位号、分区和层高符合约定', () => {
    const data = createMockData()
    expect(data.desks.every((desk) => /^(?:B1|F(?:[1-9]|1\d|2[0-2]))-\d+$/.test(desk.id))).toBe(true)

    const byId = Object.fromEntries(data.floors.map((floor) => [floor.id, floor]))
    expect(byId.B1.elevation).toBeCloseTo(-5.5, 5)
    expect(byId.B1.height).toBeCloseTo(5.5, 5)
    expect(byId.F1.elevation).toBeCloseTo(0, 5)
    expect(byId.F1.height).toBeCloseTo(6, 5)
    expect(byId.F2.elevation).toBeCloseTo(6, 5)
    expect(byId.F2.height).toBeCloseTo(4.2, 5)
    expect(byId.F22.elevation).toBeCloseTo(90, 5)
    expect(byId.F22.elevation + byId.F22.height).toBeCloseTo(TOWER_ROOF_M, 5)

    const zones = (floorId: string) => new Set(data.desks.filter((desk) => desk.floorId === floorId).map((desk) => desk.zone))
    expect(zones('F1')).toEqual(new Set(['tower', 'podium', 'east']))
    expect(zones('F12')).toEqual(new Set(['tower']))
    expect(zones('B1')).toEqual(new Set(['podium']))

  })
})
