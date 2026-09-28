import type { StateCreator } from 'zustand'
import type { CameraId, DayNight, QualityTier, ViewMode } from '../types'
import type { TwinStore } from './types'

const QUALITY_ORDER: QualityTier[] = ['high', 'balanced', 'perf']

export interface ViewSlice {
  view: ViewMode
  exploded: boolean
  dayNight: DayNight
  quality: QualityTier
  qualityPinned: boolean
  urlQuality: QualityTier | null
  downgradeSuppressed: boolean
  selectedFloor: string | null
  hoveredFloor: string | null
  focusedDeskId: string | null
  /** 告警抽屉点中的设备。T005 飞镜头仍只看 floor / deskId / focusSeq。 */
  focusedDeviceId: string | null
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
  /** 每次 focusDevice 加一。T005 订阅该序号后再做镜头飞行。 */
  focusSeq: number
  focusDevice: (target: { floor: string; deskId: string | null; deviceId?: string | null }) => void
}

export const createViewSlice: StateCreator<TwinStore, [], [], ViewSlice> = (set, get) => ({
  view: 'building',
  exploded: false,
  dayNight: 'day',
  quality: 'balanced',
  qualityPinned: false,
  urlQuality: null,
  downgradeSuppressed: false,
  selectedFloor: null,
  hoveredFloor: null,
  focusedDeskId: null,
  focusedDeviceId: null,
  cam: null,
  focusSeq: 0,
  setView: (view) => set({ view }),
  setExploded: (exploded) => set({ exploded }),
  setDayNight: (dayNight) => set({ dayNight }),
  setQuality: (quality) => set({ quality, downgradeSuppressed: true }),
  declineQuality: () => {
    const { qualityPinned, downgradeSuppressed, quality } = get()
    if (qualityPinned || downgradeSuppressed) return
    const index = QUALITY_ORDER.indexOf(quality)
    const next = QUALITY_ORDER[Math.min(index + 1, QUALITY_ORDER.length - 1)]
    if (next !== quality) set({ quality: next })
  },
  setSelectedFloor: (selectedFloor) => set({ selectedFloor }),
  setHoveredFloor: (hoveredFloor) => set({ hoveredFloor }),
  setFocusedDeskId: (focusedDeskId) => set({ focusedDeskId }),
  setCam: (cam) => set({ cam }),
  focusDevice: ({ floor, deskId, deviceId = null }) =>
    set((state) => ({
      selectedFloor: floor,
      focusedDeskId: deskId,
      focusedDeviceId: deviceId,
      view: 'floor',
      focusSeq: state.focusSeq + 1,
    })),
})
