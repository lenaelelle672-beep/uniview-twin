import type { StateCreator } from 'zustand'
import type { DeviceStatus } from '../types'
import type { TwinStore } from './types'

export interface AlarmFloorRange {
  start: string
  end: string
}

export interface FilterSlice {
  alarmFloorRange: AlarmFloorRange | null
  statusFilter: DeviceStatus[]
  searchQuery: string
  setAlarmFloorRange: (range: AlarmFloorRange | null) => void
  setStatusFilter: (statusFilter: DeviceStatus[]) => void
  setSearchQuery: (searchQuery: string) => void
}

export const createFilterSlice: StateCreator<TwinStore, [], [], FilterSlice> = (set) => ({
  alarmFloorRange: null,
  statusFilter: [],
  searchQuery: '',
  setAlarmFloorRange: (alarmFloorRange) => set({ alarmFloorRange }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
})
