import type { StateCreator } from 'zustand'
import type { Alarm, DeviceStatus } from '../types'
import type { TwinStore } from './types'

export interface AlarmFloorRange {
  start: string
  end: string
}

/** 时间轴回放写进 store 的一帧。null 表示用现网快照。 */
export interface AlarmPlaybackFrame {
  cursorMs: number
  /** 这一刻仍未恢复、且应参与多描边的工位。空数组表示这一刻没有告警描边。 */
  alarmDeskIds: readonly string[]
  /** 交给 ZoneHeat 现有读路径的告警快照。 */
  alarms: readonly Alarm[]
}

export interface FilterSlice {
  alarmFloorRange: AlarmFloorRange | null
  statusFilter: DeviceStatus[]
  searchQuery: string
  /** null 表示停在「现在」，3D 读现网快照。 */
  alarmCursorMs: number | null
  alarmPlayback: AlarmPlaybackFrame | null
  setAlarmFloorRange: (range: AlarmFloorRange | null) => void
  setStatusFilter: (statusFilter: DeviceStatus[]) => void
  setSearchQuery: (searchQuery: string) => void
  setAlarmPlayback: (frame: AlarmPlaybackFrame | null) => void
  clearAlarmPlayback: () => void
}

export const createFilterSlice: StateCreator<TwinStore, [], [], FilterSlice> = (set) => ({
  alarmFloorRange: null,
  statusFilter: [],
  searchQuery: '',
  alarmCursorMs: null,
  alarmPlayback: null,
  setAlarmFloorRange: (alarmFloorRange) => set({ alarmFloorRange }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setAlarmPlayback: (alarmPlayback) =>
    set({
      alarmPlayback,
      alarmCursorMs: alarmPlayback?.cursorMs ?? null,
    }),
  clearAlarmPlayback: () =>
    set((state) => {
      if (state.alarmPlayback == null && state.alarmCursorMs == null) return state
      return { alarmPlayback: null, alarmCursorMs: null }
    }),
})
