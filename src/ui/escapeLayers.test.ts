import { beforeEach, describe, expect, it } from 'vitest'
import {
  dismissTopEscapeLayer,
  escapeLayerCount,
  registerEscapeLayer,
  resetEscapeLayers,
} from './escapeLayers'

describe('Esc 分层', () => {
  beforeEach(() => {
    resetEscapeLayers()
  })

  it('一次只关最上层，关完标记已处理', () => {
    const closed: string[] = []
    const dropDrawer = registerEscapeLayer('drawer', () => {
      closed.push('drawer')
    })
    const dropSearch = registerEscapeLayer('search', () => {
      closed.push('search')
    })

    expect(dismissTopEscapeLayer()).toBe(true)
    expect(closed).toEqual(['search'])
    dropSearch()

    expect(dismissTopEscapeLayer()).toBe(true)
    expect(closed).toEqual(['search', 'drawer'])
    dropDrawer()

    expect(dismissTopEscapeLayer()).toBe(false)
    expect(closed).toEqual(['search', 'drawer'])
  })

  it('没有打开的层时 Esc 才能退层', () => {
    let exited = false
    const handleEsc = () => {
      if (dismissTopEscapeLayer()) return 'overlay'
      exited = true
      return 'exit-floor'
    }

    const drop = registerEscapeLayer('strip', () => {
      drop()
    })
    expect(handleEsc()).toBe('overlay')
    expect(exited).toBe(false)
    expect(escapeLayerCount()).toBe(0)

    expect(handleEsc()).toBe('exit-floor')
    expect(exited).toBe(true)
  })

  it('注销后不再挡住退层', () => {
    const drop = registerEscapeLayer('drawer', () => undefined)
    drop()
    expect(dismissTopEscapeLayer()).toBe(false)
  })
})
