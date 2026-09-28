import { describe, expect, it } from 'vitest'
import { createMockData } from '../data/mockData'
import { buildExceptionRows, filterAlarmRows } from './alarmRows'
import { buildFocusDetail } from './focusDetail'

describe('告警详情', () => {
  it('点中的告警能还原工位、使用人和设备', () => {
    const data = createMockData()
    const row = filterAlarmRows(buildExceptionRows(data), { start: 'F10', end: 'F15' }, []).find((item) => item.deskId)
    expect(row?.deskId).toBeTruthy()
    const detail = buildFocusDetail(data, { deskId: row!.deskId, deviceId: row!.deviceId })
    expect(detail?.desk?.id).toBe(row!.deskId)
    expect(detail?.desk?.personName).not.toBe('—')
    expect(detail?.device).toMatchObject({
      id: row!.deviceId,
      status: 'alarm',
      statusLabel: '告警',
      time: row!.time,
      message: row!.message,
    })
  })

  it('没有工位的设备只给出设备信息', () => {
    const data = createMockData()
    const camera = data.devices.find((device) => device.status === 'alarm' && !device.deskId)
    expect(camera).toBeTruthy()
    const detail = buildFocusDetail(data, { deskId: null, deviceId: camera!.id })
    expect(detail?.desk).toBeNull()
    expect(detail?.device?.id).toBe(camera!.id)
  })
})
