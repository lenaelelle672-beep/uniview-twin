import { describe, expect, it } from 'vitest'
import { createMockData } from '../data/mockData'
import { alarmBadgeSum, buildExceptionRows, filterAlarmRows } from './alarmRows'
import { alarmsToCsv, csvDataRowCount } from './csv'

describe('告警 CSV', () => {
  it('按当前筛选导出，UTF-8 带 BOM，数据行数等于列表条数', () => {
    const data = createMockData()
    const range = { start: 'F10', end: 'F15' }
    const listed = filterAlarmRows(buildExceptionRows(data), range, [])
    const csv = alarmsToCsv(listed)
    const bytes = new TextEncoder().encode(csv)

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(csvDataRowCount(csv)).toBe(listed.length)
    expect(listed.length).toBe(alarmBadgeSum(data.floors, range))
    expect(csv).toContain('楼层,工位,设备,状态,时间,说明')
    expect(csv).toContain('告警')
    expect(csv.includes('\n') && csv.includes('\r\n')).toBe(true)
  })

  it('含逗号或引号的说明按 CSV 转义', () => {
    const csv = alarmsToCsv([
      {
        id: 'a',
        floorId: 'F12',
        deskId: null,
        deviceId: 'F12-CAM1',
        deviceType: 'camera',
        status: 'alarm',
        time: '2026-09-28 09:00',
        message: '门厅, "西侧"',
      },
    ])
    expect(csv).toContain('"门厅, ""西侧"""')
    expect(csv).toContain('—,摄像头 · F12-CAM1,告警')
  })
})
