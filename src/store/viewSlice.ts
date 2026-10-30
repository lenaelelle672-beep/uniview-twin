import { startTransition } from 'react'
import type { StateCreator } from 'zustand'
import { isFloorId } from '../data/floors'
import type { CameraId, DayNight, QualityTier, ViewMode } from '../types'
import type { TwinStore } from './types'

function releaseHeldViewpoint(): void {
  if (typeof window === 'undefined') return
  window.__vpH = false
}

function dropped<T extends object>(patch: T): T & { vp: null } {
  return { ...patch, vp: null }
}

const QUALITY_ORDER: QualityTier[] = ['high', 'balanced', 'perf']

export type Presentation = 'lit' | 'model'

export interface LayerFlags {
  people: boolean
  labels: boolean
  heat: boolean
  outlines: boolean
  badges: boolean
  /** T060 结构边。默认关。与 T063 的 layers.wireframe 同时为真时只画这一边。 */
  edges: boolean
}

export type LayerKey = keyof LayerFlags

/** T063 线框、T064 铭牌、T065 贴花、T072 批线、T069 导览轨、T074 工位屏、T079 屏海报。不放进 LayerFlags，缺省不写进初始对象，避免首屏变长，也避免缺省字段把图层判断的返回值变成 undefined。运行时由 setLayer 写入。T079 晚加载开关把缺省读成开。 */
export type LayerToggleKey = LayerKey | 'wireframe' | 'plaques' | 'decals' | 'segments' | 'tourPath' | 'screenVideo' | 'screenImage'

export interface ViewSlice {
  view: ViewMode
  exploded: boolean
  /** 爆炸目标 0..1。大于 0 时 exploded 为真。首屏对象不写这个字段，晚加载再装。 */
  explodeProgress: number
  dayNight: DayNight
  presentation: Presentation
  quality: QualityTier
  qualityPinned: boolean
  urlQuality: QualityTier | null
  downgradeSuppressed: boolean
  /** 人流、标签、热力、描边、圆标默认开。结构边默认关。线框、铭牌、贴花和导览轨另计，缺省关。 */
  layers: LayerFlags
  selectedFloor: string | null
  hoveredFloor: string | null
  focusedDeskId: string | null
  /** 告警抽屉点中的设备。T005 飞镜头仍只看 floor / deskId / focusSeq。 */
  focusedDeviceId: string | null
  cam: CameraId | null
  /** 双击楼层时递增。T004 用它触发飞入；本任务不改视图。 */
  floorFlyRequest: { floorId: string; nonce: number } | null
  /** 无效的 ?pos=。中文提示，不抛错、不白屏。 */
  posNotice: string | null
  setView: (view: ViewMode) => void
  setExploded: (exploded: boolean) => void
  /** 滑杆和键盘档写这里。0 收拢，1 完全展开。晚加载才挂上。 */
  setExplodeProgress: (value: number) => void
  setDayNight: (dayNight: DayNight) => void
  setQuality: (quality: QualityTier) => void
  setLayer: (key: LayerToggleKey, on: boolean) => void
  declineQuality: () => void
  setSelectedFloor: (floorId: string | null) => void
  setHoveredFloor: (floorId: string | null) => void
  setFocusedDeskId: (deskId: string | null) => void
  /** 蓝图点选工位：记下工位和该工位电脑，不改变当前视图。 */
  selectDesk: (deskId: string) => void
  setCam: (cam: CameraId | null) => void
  /** 双击楼层时递增。飞入本身由 enterFloor 进入单层。 */
  emitFloorFly: (floorId: string) => void
  enterFloor: (floorId: string) => void
  exitFloor: () => void
  /** 每次 focusDevice 加一。T005 订阅该序号后再做镜头飞行。 */
  focusSeq: number
  focusDevice: (target: { floor: string; deskId: string | null; deviceId?: string | null }) => void
  /** 已规范化的 `?vp=`。null 表示地址栏没有视角。字段名保持很短，避免首屏包变大。 */
  vp: string | null
  /** 同一条链接再次套用时也要重新对齐镜头。 */
  vpSeq: number
  showViewpoint: (next: {
    token: string
    view: ViewMode
    floor: string | null
    cam: CameraId | null
    /** 不传则保留当前工位。传 null 表示这个视角没有工位焦点。 */
    pos?: string | null
  }) => void
}

export const createViewSlice: StateCreator<TwinStore, [], [], ViewSlice> = (set, get) => ({
  view: 'building',
  exploded: false,
  dayNight: 'day',
  presentation: 'lit',
  quality: 'balanced',
  qualityPinned: false,
  urlQuality: null,
  downgradeSuppressed: false,
  layers: { people: true, labels: true, heat: true, outlines: true, badges: true, edges: false },
  selectedFloor: null,
  hoveredFloor: null,
  focusedDeskId: null,
  focusedDeviceId: null,
  cam: null,
  floorFlyRequest: null,
  posNotice: null,
  focusSeq: 0,
  vp: null,
  vpSeq: 0,
  setView: (view) => {
    if (get().view === view) return
    releaseHeldViewpoint()
    startTransition(() => set(dropped({ view })))
  },
  setExploded: (exploded) => {
    if (get().exploded === exploded) return
    releaseHeldViewpoint()
    set(dropped({ exploded }))
  },
  setDayNight: (dayNight) => {
    if (get().dayNight === dayNight) return
    // 跟进层一样同步写。startTransition 会把夜景材质、灯和雾让到主线程空闲，
    // 截图把线程占满时，这轮提交会掉进工位停稳后的 1.8 秒。
    set({ dayNight })
  },
  setQuality: (quality) => startTransition(() => set({ quality, downgradeSuppressed: true })),
  setLayer: (key, on) => {
    const layers = get().layers as LayerFlags & {
      wireframe?: boolean
      plaques?: boolean
      decals?: boolean
      segments?: boolean
      tourPath?: boolean
      screenVideo?: boolean
      screenImage?: boolean
    }
    if (layers[key] === on) return
    set({ layers: { ...layers, [key]: on } as LayerFlags })
  },
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
  selectDesk: (deskId) => {
    const splitAt = deskId.lastIndexOf('-')
    const floorId = splitAt > 0 ? deskId.slice(0, splitAt) : ''
    if (!isFloorId(floorId)) return
    const pc = get().devices.find((device) => device.deskId === deskId && device.type === 'pc')
    releaseHeldViewpoint()
    set(
      dropped({
        selectedFloor: floorId,
        focusedDeskId: deskId,
        focusedDeviceId: pc?.id ?? null,
      }),
    )
  },
  setCam: (cam) => {
    if (get().cam === cam) return
    releaseHeldViewpoint()
    startTransition(() => set(dropped({ cam })))
  },
  emitFloorFly: (floorId) =>
    set({
      floorFlyRequest: {
        floorId,
        nonce: (get().floorFlyRequest?.nonce ?? 0) + 1,
      },
    }),
  enterFloor: (floorId) => {
    if (!isFloorId(floorId)) return
    const { view, selectedFloor } = get()
    if (view === 'floor' && selectedFloor === floorId) return
    // 跟 focusDevice 一样同步切 view。startTransition 会把进层让给首屏预取，
    // ready 后 500ms 双击时镜头要等那一轮画完才动。
    releaseHeldViewpoint()
    set(dropped({ view: 'floor', selectedFloor: floorId }))
  },
  exitFloor: () => {
    if (get().view !== 'floor') return
    releaseHeldViewpoint()
    // 和视图切回总览同一次写入，避免离层途中先把描边刷回现网再卸室内。
    startTransition(() =>
      set(
        dropped({
          view: 'building',
          alarmPlayback: null,
        }),
      ),
    )
  },
  focusDevice: ({ floor, deskId, deviceId = null }) => {
    releaseHeldViewpoint()
    set((state) =>
      dropped({
        selectedFloor: floor,
        focusedDeskId: deskId,
        focusedDeviceId: deviceId,
        view: 'floor' as const,
        posNotice: null,
        focusSeq: state.focusSeq + 1,
      }),
    )
  },
  showViewpoint: ({ token, view, floor, cam, pos }) => {
    if (typeof window !== 'undefined') window.__vpH = true
    set((state) => ({
      vp: token,
      vpSeq: state.vpSeq + 1,
      view,
      selectedFloor: floor,
      cam,
      focusedDeskId: pos === undefined ? state.focusedDeskId : pos,
      focusedDeviceId: pos === undefined || pos === state.focusedDeskId ? state.focusedDeviceId : null,
    }))
  },
} as ViewSlice)
