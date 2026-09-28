import type { StateCreator } from 'zustand'
import type { Alarm, Desk, Device, Floor, Person } from '../types'
import type { TwinStore } from './types'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface DataSlice {
  floors: Floor[]
  desks: Desk[]
  devices: Device[]
  people: Person[]
  alarms: Alarm[]
  status: LoadStatus
  error: string | null
  dataUrl: string | null
  setDataUrl: (dataUrl: string | null) => void
  setLoading: () => void
  setData: (data: {
    floors: Floor[]
    desks: Desk[]
    devices: Device[]
    people: Person[]
    alarms: Alarm[]
  }) => void
  setError: (error: string) => void
}

const emptyData = {
  floors: [] as Floor[],
  desks: [] as Desk[],
  devices: [] as Device[],
  people: [] as Person[],
  alarms: [] as Alarm[],
}

export const createDataSlice: StateCreator<TwinStore, [], [], DataSlice> = (set) => ({
  ...emptyData,
  status: 'loading',
  error: null,
  dataUrl: null,
  setDataUrl: (dataUrl) => set({ dataUrl }),
  setLoading: () => set({ status: 'loading', error: null, ...emptyData }),
  setData: (data) => set({ ...data, status: 'ready', error: null }),
  setError: (error) => set({ status: 'error', error, ...emptyData }),
})
