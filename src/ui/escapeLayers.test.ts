import { beforeEach, describe, expect, it } from 'vitest'
import {
  dismissTopEscapeLayer,
  escapeLayerCount,
  nextSearchEscapeAction,
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

  it('搜索框聚焦时 Esc 先关列表、再清空、再失焦，不关其它层', () => {
    const log: string[] = []
    let listOpen = true
    let query = '周伟66'
    let focused = true
    const dropDrawer = registerEscapeLayer('drawer', () => {
      log.push('drawer')
    })
    const dropSearch = registerEscapeLayer('search', () => {
      const action = nextSearchEscapeAction({ focused, listOpen, query })
      if (!action) return
      log.push(action)
      if (action === 'close-list') listOpen = false
      else if (action === 'clear') query = ''
      else {
        focused = false
        dropSearch()
      }
    })

    expect(nextSearchEscapeAction({ focused: true, listOpen: true, query: '周伟66' })).toBe('close-list')
    expect(nextSearchEscapeAction({ focused: true, listOpen: false, query: '周伟66' })).toBe('clear')
    expect(nextSearchEscapeAction({ focused: true, listOpen: false, query: '' })).toBe('blur')
    expect(nextSearchEscapeAction({ focused: false, listOpen: false, query: '' })).toBe(null)

    expect(dismissTopEscapeLayer()).toBe(true)
    expect(log).toEqual(['close-list'])
    expect(dismissTopEscapeLayer()).toBe(true)
    expect(log).toEqual(['close-list', 'clear'])
    expect(dismissTopEscapeLayer()).toBe(true)
    expect(log).toEqual(['close-list', 'clear', 'blur'])
    expect(focused).toBe(false)

    expect(dismissTopEscapeLayer()).toBe(true)
    expect(log).toEqual(['close-list', 'clear', 'blur', 'drawer'])
    dropDrawer()
  })

  it('搜索框失焦后 Esc 才关抽屉或退单层', () => {
    let view = 'floor'
    const handleEsc = () => {
      if (dismissTopEscapeLayer()) return 'overlay'
      view = 'building'
      return 'exit-floor'
    }
    const dropSearch = registerEscapeLayer('search', () => {
      dropSearch()
    })
    expect(handleEsc()).toBe('overlay')
    expect(view).toBe('floor')
    expect(handleEsc()).toBe('exit-floor')
    expect(view).toBe('building')
  })
})
