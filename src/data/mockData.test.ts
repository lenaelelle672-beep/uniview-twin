import { describe, expect, it } from 'vitest'
import { floorDeskCount } from '../floors/deskCounts'
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

  it('每层按图纸工位数生成人员和设备，并带齐四种设备状态', () => {
    const data = createMockData()
    expect(data.floors.map((floor) => floor.id)).toEqual(floorIdList())
    expect(data.floors).toHaveLength(23)

    for (const floor of data.floors) {
      const desks = data.desks.filter((desk) => desk.floorId === floor.id)
      const devices = data.devices.filter((device) => device.floorId === floor.id)
      const people = data.people.filter((person) => person.floorId === floor.id)
      const deskCount = floorDeskCount(floor.id)
      expect(desks).toHaveLength(deskCount)
      expect(people).toHaveLength(deskCount)
      expect(devices.filter((device) => device.type === 'pc')).toHaveLength(deskCount)
      expect(devices.filter((device) => device.type === 'phone')).toHaveLength(deskCount)
      expect(devices.filter((device) => device.type === 'printer')).toHaveLength(2)
      const cameras = devices.filter((device) => device.type === 'camera')
      expect(cameras.length).toBeGreaterThanOrEqual(4)
      expect(cameras.length).toBeLessThanOrEqual(6)
      expect(new Set(devices.map((device) => device.status))).toEqual(ALL_STATUSES)
      expect(floor.alarmCount).toBe(devices.filter((device) => device.status === 'alarm').length)
      expect(floor.offlineCount).toBe(devices.filter((device) => device.status === 'offline').length)

      const heavy = (ALARM_HEAVY_FLOORS as readonly string[]).includes(floor.id)
      const idle = devices.filter((device) => device.status === 'idle').length / devices.length
      if (devices.length >= 20) {
        expect(idle).toBeGreaterThan(0.12)
        expect(idle).toBeLessThan(0.18)
      }
      if (!heavy && deskCount >= 100) {
        expect(floor.alarmCount).toBeGreaterThanOrEqual(5)
        expect(floor.offlineCount).toBeGreaterThanOrEqual(1)
      }
    }

    const comparable = (floorId: string) => {
      const n = floorDeskCount(floorId)
      return n >= 100 && n <= 200
    }
    const normal = data.floors.filter(
      (floor) => !(ALARM_HEAVY_FLOORS as readonly string[]).includes(floor.id) && comparable(floor.id),
    )
    const heavy = data.floors.filter((floor) => (ALARM_HEAVY_FLOORS as readonly string[]).includes(floor.id) && comparable(floor.id))
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
    expect(byId.F1.height).toBeCloseTo(6.85, 5)
    expect(byId.F2.elevation).toBeCloseTo(6.85, 5)
    expect(byId.F2.height).toBeCloseTo(6, 5)
    expect(byId.F8.elevation).toBeCloseTo(35.65, 5)
    expect(byId.F22.elevation).toBeCloseTo(95.897, 3)
    expect(byId.F22.elevation + byId.F22.height).toBeCloseTo(TOWER_ROOF_M, 3)

    const zones = (floorId: string) => new Set(data.desks.filter((desk) => desk.floorId === floorId).map((desk) => desk.zone))
    expect(zones('F12')).toEqual(new Set(['tower']))
    expect(zones('B1')).toEqual(new Set(['podium']))
    expect(data.desks.filter((desk) => desk.floorId === 'B1')).toHaveLength(DESKS_PER_FLOOR)

  })
})
