import { beforeEach, describe, expect, it } from 'vitest'
import { resetTwinStore, useTwinStore } from './store'
import type { LayerKey } from './viewSlice'

describe('楼层双击事件', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('双击只记录飞入请求，不改变视图', () => {
    useTwinStore.getState().emitFloorFly('F12')
    const first = useTwinStore.getState()
    expect(first.floorFlyRequest).toEqual({ floorId: 'F12', nonce: 1 })
    expect(first.view).toBe('building')
    expect(first.selectedFloor).toBeNull()

    useTwinStore.getState().emitFloorFly('F12')
    expect(useTwinStore.getState().floorFlyRequest).toEqual({ floorId: 'F12', nonce: 2 })
    useTwinStore.getState().emitFloorFly('F3')
    expect(useTwinStore.getState().floorFlyRequest).toEqual({ floorId: 'F3', nonce: 3 })
    expect(useTwinStore.getState().view).toBe('building')
  })
})

describe('图层开关', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('默认全开，关掉一项不影响其余，重复写入不换对象', () => {
    const initial = useTwinStore.getState().layers
    expect(initial).toEqual({ people: true, labels: true, heat: true, outlines: true, badges: true })
    useTwinStore.getState().setLayer('heat', false)
    const next = useTwinStore.getState().layers
    expect(next).toEqual({ people: true, labels: true, heat: false, outlines: true, badges: true })
    expect(next).not.toBe(initial)
    useTwinStore.getState().setLayer('heat', false)
    expect(useTwinStore.getState().layers).toBe(next)
    const keys: LayerKey[] = ['people', 'labels', 'heat', 'outlines', 'badges']
    for (const key of keys) useTwinStore.getState().setLayer(key, false)
    expect(useTwinStore.getState().layers).toEqual({
      people: false,
      labels: false,
      heat: false,
      outlines: false,
      badges: false,
    })
    useTwinStore.getState().enterFloor('F3')
    expect(useTwinStore.getState().layers.people).toBe(false)
    expect(useTwinStore.getState().view).toBe('floor')
  })
})