export const VIEW_MODES = ['building', 'floor', 'blueprint'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export const DAY_NIGHT = ['day', 'night'] as const
export type DayNight = (typeof DAY_NIGHT)[number]

export const QUALITY_TIERS = ['perf', 'balanced', 'high'] as const
export type QualityTier = (typeof QUALITY_TIERS)[number]

export const DEVICE_STATUSES = ['online', 'idle', 'alarm', 'offline'] as const
export type DeviceStatus = (typeof DEVICE_STATUSES)[number]

export const DEVICE_TYPES = ['pc', 'phone', 'printer', 'camera'] as const
export type DeviceType = (typeof DEVICE_TYPES)[number]

export const ZONES = ['tower', 'podium', 'east'] as const
export type Zone = (typeof ZONES)[number]

export const CAMERA_IDS = ['photo1', 'p2f000', 'p2f001', 'p2f002', 'p2f003', 'east'] as const
export type CameraId = (typeof CAMERA_IDS)[number]

export interface Floor {
  id: string
  name: string
  level: number
  elevation: number
  height: number
  alarmCount: number
  offlineCount: number
}

export interface Desk {
  id: string
  floorId: string
  index: number
  zone: Zone
  /**
   * 历史载荷。D027 / D034：坐标可选，带了也必须忽略。
   * 摆放、定位和详情只调用 workstationPosition。
   */
  x?: number
  y?: number
  z?: number
}

export interface Device {
  id: string
  floorId: string
  deskId?: string
  type: DeviceType
  status: DeviceStatus
  zone: Zone
}

export interface Person {
  id: string
  deskId: string
  floorId: string
  name: string
}

export interface Alarm {
  id: string
  deviceId: string
  floorId: string
  message: string
}

export interface TwinData {
  floors: Floor[]
  desks: Desk[]
  devices: Device[]
  people: Person[]
  alarms: Alarm[]
}

export interface TwinDataAdapter {
  load(): Promise<TwinData>
}
