import { describe, expect, it } from 'vitest'
import { createMockData } from '../data/mockData'
import {
  alarmBadgeSum,
  buildExceptionRows,
  effectiveStatuses,
  filterAlarmRows,
  floorInRange,
  offlineBadgeSum,
} from './alarmRows'

const data = createMockData()
const rows = buildExceptionRows(data)
const range = { start: 'F10', end: 'F15' }

describe('告警列表筛选', () => {
  it('F10~F15 的告警条数等于这 6 层侧栏告警徽标合计', () => {
    const listed = filterAlarmRows(rows, range, [])
    const floors = data.floors.filter((floor) => floorInRange(floor.id, range))
    expect(floors.map((floor) => floor.id)).toEqual(['F10', 'F11', 'F12', 'F13', 'F14', 'F15'])
    const badge = alarmBadgeSum(data.floors, range)
    expect(listed).toHaveLength(badge)
    expect(listed.every((row) => row.status === 'alarm')).toBe(true)
    expect(new Set(listed.map((row) => row.floorId))).toEqual(new Set(['F10', 'F11', 'F12', 'F13', 'F14', 'F15']))
    expect(badge).toBeGreaterThan(0)
  })

  it('起止楼层对调后范围不变', () => {
    const forward = filterAlarmRows(rows, range, ['alarm'])
    const reversed = filterAlarmRows(rows, { start: 'F15', end: 'F10' }, ['alarm'])
    expect(reversed.map((row) => row.deviceId)).toEqual(forward.map((row) => row.deviceId))
  })

  it('未选状态时只含告警，离线筛选与离线徽标一致', () => {
    expect(effectiveStatuses([])).toEqual(['alarm'])
    const offline = filterAlarmRows(rows, range, ['offline'])
    expect(offline).toHaveLength(offlineBadgeSum(data.floors, range))
    expect(offline.every((row) => row.status === 'offline')).toBe(true)
    const both = filterAlarmRows(rows, range, ['alarm', 'offline'])
    expect(both).toHaveLength(alarmBadgeSum(data.floors, range) + offlineBadgeSum(data.floors, range))
  })

  it('在线和空闲设备不进入告警抽屉', () => {
    expect(rows.some((row) => row.status === 'online' || row.status === 'idle')).toBe(false)
    const alarmDevices = data.devices.filter((device) => device.status === 'alarm').length
    expect(filterAlarmRows(rows, null, [])).toHaveLength(alarmDevices)
  })

  it('每条告警都带楼层、设备、状态和稳定时间', () => {
    const sample = filterAlarmRows(rows, range, [])[0]
    expect(sample.floorId).toMatch(/^F1[0-5]$/)
    expect(sample.deviceId.startsWith(sample.floorId)).toBe(true)
    expect(sample.time).toMatch(/^2026-09-\d{2} \d{2}:\d{2}$/)
    expect(sample.message).toContain('告警')
    const again = buildExceptionRows(createMockData()).find((row) => row.deviceId === sample.deviceId)
    expect(again?.time).toBe(sample.time)
  })
})
