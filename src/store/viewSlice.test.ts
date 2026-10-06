import { beforeEach, describe, expect, it } from 'vitest'
import { resetTwinStore, useTwinStore } from './store'

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