import { afterEach, describe, expect, it, vi } from 'vitest'
import sample from '../../public/sample.json'
import { JsonAdapter } from './adapters'
import { validateTwinData } from './validate'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('JsonAdapter', () => {
  it('校验 public/sample.json，并按设备状态统计告警和离线', () => {
    const data = validateTwinData(sample)
    expect(data.floors.map((floor) => floor.id)).toEqual(['F1', 'F2'])
    expect(data.floors.find((floor) => floor.id === 'F1')).toMatchObject({ alarmCount: 1, offlineCount: 1 })
    expect(data.floors.find((floor) => floor.id === 'F2')).toMatchObject({ alarmCount: 1, offlineCount: 0 })
  })

  it('从站内 JSON 加载样例', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => sample,
      })),
    )
    const data = await new JsonAdapter('/sample.json').load()
    expect(data.desks.map((desk) => desk.id)).toEqual(['F1-1', 'F1-2', 'F2-1'])
  })

  it('文件不存在时给出中文错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => 'text/plain' },
        json: async () => ({}),
      })),
    )
    await expect(new JsonAdapter('/不存在.json').load()).rejects.toThrow('找不到数据文件：/不存在.json（HTTP 404）')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/html' },
        json: async () => {
          throw new Error('不应解析 HTML')
        },
      })),
    )
    await expect(new JsonAdapter('/不存在.json').load()).rejects.toThrow('找不到数据文件：/不存在.json')
  })

  it('非法 JSON 与缺字段都报中文错误，且不请求外站', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => {
          throw new SyntaxError('Unexpected token')
        },
      })),
    )
    await expect(new JsonAdapter('/sample.json').load()).rejects.toThrow('数据文件不是合法的 JSON：/sample.json')

    expect(() => validateTwinData({ desks: [], devices: [], people: [], alarms: [] })).toThrow('数据格式不正确：floors 必须是数组')
    expect(() => validateTwinData({ floors: [{}], desks: [], devices: [], people: [], alarms: [] })).toThrow(/floors\[0\]\.id/)

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(new JsonAdapter('https://example.com/a.json').load()).rejects.toThrow('数据地址必须是以 / 开头的站内路径')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
