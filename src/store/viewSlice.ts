import type { StateCreator } from 'zustand'
import type { CameraId, DayNight, QualityTier, ViewMode } from '../types'
import type { TwinStore } from './types'

const QUALITY_ORDER: QualityTier[] = ['high', 'balanced', 'perf']

export type Presentation = 'lit' | 'model'

export interface ViewSlice {
  view: ViewMode
  exploded: boolean
  dayNight: DayNight
  presentation: Presentation
  quality: QualityTier
  qualityPinned: boolean
  selectedFloor: string | null
  hoveredFloor: string | null
  focusedDeskId: string | null
  cam: CameraId | null
  setView: (view: ViewMode) => void
  setExploded: (exploded: boolean) => void
  setDayNight: (dayNight: DayNight) => void
  setQuality: (quality: QualityTier) => void
  declineQuality: () => void
  setSelectedFloor: (floorId: string | null) => void
  setHoveredFloor: (floorId: string | null) => void
  setFocusedDeskId: (deskId: string | null) => void
  setCam: (cam: CameraId | null) => void
}

export const createViewSlice: StateCreator<TwinStore, [], [], ViewSlice> = (set, get) => ({
  view: 'building',
  exploded: false,
  dayNight: 'day',
  presentation: 'lit',
  quality: 'balanced',
  qualityPinned: false,
  selectedFloor: null,
  hoveredFloor: null,
  focusedDeskId: null,
  cam: null,
  setView: (view) => set({ view }),
  setExploded: (exploded) => set({ exploded }),
  setDayNight: (dayNight) => set({ dayNight }),
  setQuality: (quality) => set({ quality, qualityPinned: true }),
  declineQuality: () => {
    const { qualityPinned, quality } = get()
    if (qualityPinned) return
    const index = QUALITY_ORDER.indexOf(quality)
    const next = QUALITY_ORDER[Math.min(index + 1, QUALITY_ORDER.length - 1)]
    if (next !== quality) set({ quality: next })
  },
  setSelectedFloor: (selectedFloor) => set({ selectedFloor }),
  setHoveredFloor: (hoveredFloor) => set({ hoveredFloor }),
  setFocusedDeskId: (focusedDeskId) => set({ focusedDeskId }),
  setCam: (cam) => set({ cam }),
})
