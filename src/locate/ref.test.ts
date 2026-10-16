import { describe, expect, it } from 'vitest'
import { hydrateFloorFromDisk } from '../floors/hydrateForTests'
import { formatWorkstationPlace } from './ref'

describe('详情坐标单位', () => {
  it('数值与 m 用不换行空格相连，F12 标高 52.86 不与单位拆开', () => {
    hydrateFloorFromDisk('F12')
    const text = formatWorkstationPlace('F12', 'F12-66')
    expect(text).toContain('标高 52.86\u00A0m')
    expect(text).toMatch(/^东 -?\d+\.\d{2}\u00A0m，标高 -?\d+\.\d{2}\u00A0m，北 -?\d+\.\d{2}\u00A0m$/)
    expect(text).not.toMatch(/\d(?:\.\d+)? m/)
  })

  it('图纸未加载时不拼单位', () => {
    expect(formatWorkstationPlace('F22', 'F22-1')).toBe('按图纸工位')
  })
})