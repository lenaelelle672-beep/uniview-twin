import { describe, expect, it } from 'vitest'
import { buildReportSearch, mainSearchFromReport, parseReportFilter } from './reportQuery'

describe('报告地址', () => {
  it('把楼层范围和画质写进报告地址，默认告警状态可省略', () => {
    const search = buildReportSearch({
      range: { start: 'F10', end: 'F15' },
      statusFilter: [],
      quality: 'balanced',
      dataUrl: '/sample.json',
    })
    expect(search).toBe('?q=balanced&data=/sample.json&alarmFrom=F10&alarmTo=F15')
    expect(parseReportFilter(search)).toMatchObject({
      range: { start: 'F10', end: 'F15' },
      statusFilter: ['alarm'],
      quality: 'balanced',
      dataUrl: '/sample.json',
    })
  })

  it('离线筛选会写入状态，返回主页面时去掉告警参数', () => {
    const search = buildReportSearch({
      range: { start: 'F3', end: 'F3' },
      statusFilter: ['offline'],
      quality: 'balanced',
      dataUrl: null,
    })
    expect(search).toBe('?q=balanced&alarmFrom=F3&alarmTo=F3&alarmStatus=offline')
    expect(mainSearchFromReport(search)).toBe('?q=balanced')
    expect(parseReportFilter('?alarmFrom=F99&alarmTo=F1')).toMatchObject({ range: null, statusFilter: ['alarm'] })
  })
})
