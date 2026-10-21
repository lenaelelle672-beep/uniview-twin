import { beforeEach, describe, expect, it } from 'vitest'
import { resetTwinStore, useTwinStore } from '../store/store'
import { applySearchToStore, parseSearch, serializeUrl, storeToSearch } from './urlState'
import { inclineAdaptiveQuality } from '../scene/adaptiveQuality'
import { formatViewpoint, parseViewpoint, roundViewpointMillimetre, type Viewpoint } from './viewpoint'

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
    inclineAdaptiveQuality()
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

  it('keepDrawingBuffer=1 往返保留，不看 q/cam', () => {
    expect(parseSearch('?q=balanced&keepDrawingBuffer=1')).toEqual({ q: 'balanced', keepDrawingBuffer: true })
    expect(parseSearch('?q=perf&cam=east')).toEqual({ q: 'perf', cam: 'east' })
    applySearchToStore('?q=balanced&keepDrawingBuffer=1')
    expect(storeToSearch()).toBe('?q=balanced&keepDrawingBuffer=1')
    applySearchToStore('?q=perf')
    expect(storeToSearch()).toBe('?q=perf')
  })

  it('?vp= 往返保留眼点和目标，非法串丢掉', () => {
    const vp: Viewpoint = {
      px: 24.1234,
      py: 70,
      pz: -12.2,
      tx: 1,
      ty: 36.5,
      tz: 8,
      fov: 33,
      fx: 0.2,
      fy: 0,
      fz: -0.4,
    }
    const token = formatViewpoint(vp)
    expect(token).toBeTruthy()
    expect(parseViewpoint(token ?? '')).toEqual(parseViewpoint(token ?? ''))
    for (const key of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'fov', 'fx', 'fy', 'fz'] as const) {
      expect(Math.abs((parseViewpoint(token ?? '')?.[key] ?? 0) - vp[key])).toBeLessThanOrEqual(0.0005)
      expect(roundViewpointMillimetre(vp[key])).toBe(parseViewpoint(token ?? '')?.[key])
    }
    expect(parseSearch(`?floor=F8&vp=${token}`).vp).toBe(token)
    expect(serializeUrl({ floor: 'F8', vp: token ?? undefined })).toBe(`?floor=F8&vp=${token}`)
    expect(parseSearch('?vp=nope')).toEqual({})
    expect(parseSearch('?vp=1~2~3~4~5~6~1')).toEqual({})
    expect(parseViewpoint('1~2~3~4~5~6~40')).toMatchObject({ fov: 40, fx: 0, fy: 0, fz: 0 })

    applySearchToStore(`?floor=F8&q=balanced&vp=${token}`)
    expect(parseViewpoint(useTwinStore.getState().vp ?? '')?.px).toBeCloseTo(24.123, 3)
    expect(useTwinStore.getState().vp).toBe(token)
    expect(useTwinStore.getState().selectedFloor).toBe('F8')
    expect(storeToSearch()).toBe(`?floor=F8&q=balanced&vp=${token}`)
  })

  it('?pos= 与 ?vp= 同时存在时工位和视角都留下', () => {
    const token = formatViewpoint({
      px: 8,
      py: 60,
      pz: 20,
      tx: 0,
      ty: 52,
      tz: 4,
      fov: 42,
      fx: 0,
      fy: 0,
      fz: 0,
    })
    applySearchToStore(`?pos=F12-66&vp=${token}`)
    const state = useTwinStore.getState()
    expect(state.view).toBe('floor')
    expect(state.selectedFloor).toBe('F12')
    expect(state.focusedDeskId).toBe('F12-66')
    expect(state.vp).toBe(token)
    expect(state.vpSeq).toBeGreaterThan(0)
    expect(storeToSearch()).toContain(`vp=${token}`)
    expect(storeToSearch()).toContain('pos=F12-66')
  })

  it('外站 data 地址不作为可加载路径，但仍保留在地址栏', () => {
    applySearchToStore('?data=https://example.com/a.json')
    expect(useTwinStore.getState().error).toContain('站内路径')
    expect(parseSearch(storeToSearch()).data).toBe('https://example.com/a.json')
  })
})
