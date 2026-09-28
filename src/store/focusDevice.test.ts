import { beforeEach, describe, expect, it } from 'vitest'
import { resetTwinStore, useTwinStore } from './store'

describe('focusDevice', () => {
  beforeEach(() => {
    resetTwinStore()
  })

  it('选中楼层和工位，并留下可重复订阅的序号', () => {
    useTwinStore.getState().focusDevice({ floor: 'F12', deskId: 'F12-66' })
    const first = useTwinStore.getState()
    expect(first.selectedFloor).toBe('F12')
    expect(first.focusedDeskId).toBe('F12-66')
    expect(first.focusedDeviceId).toBeNull()
    expect(first.view).toBe('floor')
    expect(first.focusSeq).toBe(1)

    useTwinStore.getState().focusDevice({ floor: 'F10', deskId: 'F10-11', deviceId: 'F10-11-PC' })
    expect(useTwinStore.getState().focusedDeviceId).toBe('F10-11-PC')
    expect(useTwinStore.getState().focusSeq).toBe(2)

    useTwinStore.getState().focusDevice({ floor: 'F12', deskId: 'F12-66' })
    expect(useTwinStore.getState().focusSeq).toBe(3)
    expect(useTwinStore.getState().focusedDeviceId).toBeNull()

    useTwinStore.getState().focusDevice({ floor: 'F3', deskId: null })
    const parked = useTwinStore.getState()
    expect(parked.selectedFloor).toBe('F3')
    expect(parked.focusedDeskId).toBeNull()
    expect(parked.focusedDeviceId).toBeNull()
    expect(parked.focusSeq).toBe(4)
  })
})
