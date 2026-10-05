import { beforeEach, describe, expect, it } from 'vitest'
import { resetTwinStore, useTwinStore } from '../store/store'
import { applySearchToStore, parseSearch, serializeUrl, storeToSearch } from './urlState'

describe('URL 解析与回写', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('解析 view、floor、pos、cam、data、q', () => {
    expect(parseSearch('?view=floor&floor=F12&pos=F12-66&cam=p2f000&data=/sample.json&q=perf')).toEqual({
      view: 'floor',
      floor: 'F12',
      pos: 'F12-66',
      cam: 'p2f000',
      data: '/sample.json',
      q: 'perf',
    })
    expect(parseSearch('?pos=B1-8&cam=photo1&view=blueprint&q=high')).toEqual({
      pos: 'B1-8',
      cam: 'photo1',
      view: 'blueprint',
      q: 'high',
    })
  })

  it('忽略非法取值', () => {
    expect(parseSearch('?view=orbit&floor=F23&floor=F0&pos=desk&cam=side&q=ultra')).toEqual({})
    expect(parseSearch('?cam=east')).toEqual({ cam: 'east' })
    expect(parseSearch('')).toEqual({})
  })

  it('序列化时保留站内路径的斜杠，并省略默认总览', () => {
    expect(serializeUrl({ view: 'building', q: 'balanced' })).toBe('?q=balanced')
    expect(serializeUrl({})).toBe('')
    const raw = '?view=floor&floor=B1&pos=B1-3&cam=p2f003&data=/sample.json&q=balanced'
    expect(serializeUrl(parseSearch(raw))).toBe(raw)
  })

  it('不带 q 时默认均衡档，且不锁定', () => {
    applySearchToStore('')
    expect(useTwinStore.getState().quality).toBe('balanced')
    expect(useTwinStore.getState().qualityPinned).toBe(false)
    expect(useTwinStore.getState().urlQuality).toBeNull()
    expect(storeToSearch()).toBe('')
  })

  it('?q= 固定画质档后不自动降档', () => {
    applySearchToStore('?q=high&floor=F8')
    const state = useTwinStore.getState()
    expect(state.quality).toBe('high')
    expect(state.qualityPinned).toBe(true)
    expect(state.selectedFloor).toBe('F8')
    state.declineQuality()
    expect(useTwinStore.getState().quality).toBe('high')
    expect(storeToSearch()).toBe('?floor=F8&q=high')

    useTwinStore.getState().setQuality('perf')
    expect(useTwinStore.getState().quality).toBe('perf')
    expect(useTwinStore.getState().urlQuality).toBe('high')
    expect(storeToSearch()).toBe('?floor=F8&q=high')
    useTwinStore.getState().declineQuality()
    expect(useTwinStore.getState().quality).toBe('perf')
  })

  it('未固定画质时可以降档；手动选择后本次会话不再降档，且不写 q', () => {
    useTwinStore.setState({ quality: 'high', qualityPinned: false, downgradeSuppressed: false, urlQuality: null })
    useTwinStore.getState().declineQuality()
    expect(useTwinStore.getState().quality).toBe('balanced')
    expect(useTwinStore.getState().qualityPinned).toBe(false)
    useTwinStore.getState().declineQuality()
    expect(useTwinStore.getState().quality).toBe('perf')
    useTwinStore.getState().declineQuality()
    expect(useTwinStore.getState().quality).toBe('perf')

    useTwinStore.getState().setQuality('balanced')
    expect(useTwinStore.getState().qualityPinned).toBe(false)
    expect(useTwinStore.getState().downgradeSuppressed).toBe(true)
    expect(useTwinStore.getState().urlQuality).toBeNull()
    useTwinStore.getState().declineQuality()
    expect(useTwinStore.getState().quality).toBe('balanced')
    expect(storeToSearch()).toBe('')
  })

  it('回写 view、floor、pos、cam、data', () => {
    applySearchToStore('?data=/sample.json&cam=p2f001&pos=F2-1')
    useTwinStore.getState().setView('blueprint')
    useTwinStore.getState().setSelectedFloor('F2')
    expect(storeToSearch()).toBe('?view=blueprint&floor=F2&pos=F2-1&cam=p2f001&data=/sample.json')
    expect(parseSearch(storeToSearch()).data).toBe('/sample.json')
  })

  it('style=model 往返，缺省和其他取值不写入', () => {
    expect(parseSearch('?style=model&q=balanced')).toEqual({ style: 'model', q: 'balanced' })
    expect(parseSearch('?style=night')).toEqual({})
    applySearchToStore('?style=model')
    expect(useTwinStore.getState().presentation).toBe('model')
    expect(storeToSearch()).toBe('?style=model')
    applySearchToStore('')
    expect(useTwinStore.getState().presentation).toBe('lit')
    expect(storeToSearch()).toBe('')
  })

  it('?pos= 进入对应楼层，非法编号只给出提示', () => {
    applySearchToStore('?pos=F12-66&q=balanced')
    const located = useTwinStore.getState()
    expect(located.view).toBe('floor')
    expect(located.selectedFloor).toBe('F12')
    expect(located.focusedDeskId).toBe('F12-66')
    expect(located.posNotice).toBeNull()
    expect(located.focusSeq).toBe(1)
    expect(storeToSearch()).toBe('?view=floor&floor=F12&pos=F12-66&q=balanced')

    applySearchToStore('?pos=F99-1&q=balanced')
    const missing = useTwinStore.getState()
    expect(missing.view).toBe('building')
    expect(missing.focusedDeskId).toBeNull()
    expect(missing.posNotice).toContain('找不到工位 F99-1')
    expect(missing.posNotice).toContain('F12-66')
  })

  it('外站 data 地址不作为可加载路径，但仍保留在地址栏', () => {
    applySearchToStore('?data=https://example.com/a.json')
    expect(useTwinStore.getState().error).toContain('站内路径')
    expect(parseSearch(storeToSearch()).data).toBe('https://example.com/a.json')
  })
})
