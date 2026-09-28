import { create } from 'zustand'
import { createDataSlice } from './dataSlice'
import { createFilterSlice } from './filterSlice'
import type { TwinStore } from './types'
import { createViewSlice } from './viewSlice'

export const useTwinStore = create<TwinStore>()((...args) => ({
  ...createViewSlice(...args),
  ...createDataSlice(...args),
  ...createFilterSlice(...args),
}))

export function resetTwinStore() {
  useTwinStore.setState(useTwinStore.getInitialState(), true)
}
