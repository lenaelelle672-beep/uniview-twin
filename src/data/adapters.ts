import type { TwinData, TwinDataAdapter } from '../types'
import { createMockData, MOCK_SEED } from './mockData'
import { validateTwinData } from './validate'

export function isLocalDataPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false
  if (value.includes('://') || value.includes('\\')) return false
  return true
}

export class MockAdapter implements TwinDataAdapter {
  constructor(private readonly seed = MOCK_SEED) {}

  async load(): Promise<TwinData> {
    return createMockData(this.seed)
  }
}

export class JsonAdapter implements TwinDataAdapter {
  constructor(private readonly url: string) {}

  async load(): Promise<TwinData> {
    if (!isLocalDataPath(this.url)) {
      throw new Error('数据地址必须是以 / 开头的站内路径')
    }

    let response: Response
    try {
      response = await fetch(this.url)
    } catch {
      throw new Error(`无法加载数据：${this.url}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    // 开发服务器对未知路径会回 index.html（200 + text/html），不能当成 JSON 去解析。
    if (!response.ok || contentType.includes('text/html')) {
      const statusNote = response.ok ? '' : `（HTTP ${response.status}）`
      throw new Error(`找不到数据文件：${this.url}${statusNote}`)
    }

    let json: unknown
    try {
      json = await response.json()
    } catch {
      throw new Error(`数据文件不是合法的 JSON：${this.url}`)
    }

    try {
      return validateTwinData(json)
    } catch (error) {
      if (error instanceof Error) throw error
      throw new Error('数据格式不正确')
    }
  }
}
