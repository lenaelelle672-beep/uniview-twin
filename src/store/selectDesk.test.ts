import { beforeEach, describe, expect, it } from 'vitest'
import { createMockData } from '../data/mockData'
import { resetTwinStore, useTwinStore } from './store'

describe('selectDesk', () => {
  beforeEach(() => {
    resetTwinStore()
    useTwinStore.getState().setData(createMockData())
  })

  it('蓝图点工位后留在蓝图，右侧能对上工位和电脑', () => {
    useTwinStore.getState().setView('blueprint')
    useTwinStore.getState().selectDesk('F12-66')
    const state = useTwinStore.getState()
    expect(state.view).toBe('blueprint')
    expect(state.selectedFloor).toBe('F12')
    expect(state.focusedDeskId).toBe('F12-66')
    expect(state.focusedDeviceId).toBe('F12-66-PC')
  })

  it('切回三维后工位仍然选中', () => {
    useTwinStore.getState().setView('blueprint')
    useTwinStore.getState().selectDesk('F12-66')
    useTwinStore.getState().setView('building')
    expect(useTwinStore.getState().view).toBe('building')
    expect(useTwinStore.getState().focusedDeskId).toBe('F12-66')
    expect(useTwinStore.getState().focusedDeviceId).toBe('F12-66-PC')
    useTwinStore.getState().setView('floor')
    expect(useTwinStore.getState().focusedDeskId).toBe('F12-66')
    expect(useTwinStore.getState().selectedFloor).toBe('F12')
  })

  it('忽略无法对应楼层的编号', () => {
    useTwinStore.getState().selectDesk('nope')
    expect(useTwinStore.getState().focusedDeskId).toBeNull()
    expect(useTwinStore.getState().selectedFloor).toBeNull()
  })
})
