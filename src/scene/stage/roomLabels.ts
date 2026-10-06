import { B1_CORE, CORE, KITCHEN, MEETINGS, PANTRY, RECEPTION, aabbCenter, canteenPadCenter } from './layout'

export interface RoomLabel {
  id: string
  text: string
  anchor: [number, number, number]
  label: [number, number, number]
}

export const ROOM_LABEL_FONT = '/fonts/NotoSansSC-Regular-subset.woff'
export const LABEL_MIN_PX = 13
export const LABEL_MAX_PX = 20

/** 按当前机位距离把世界字号调到不少于 minPx 屏幕像素。 */
export function worldFontSizeForDistance(
  distance: number,
  viewportHeight: number,
  fovDeg: number,
  minPx = LABEL_MIN_PX,
): number {
  if (!Number.isFinite(distance) || distance <= 0 || viewportHeight <= 0) return 0.78
  const worldPerPx = (2 * Math.tan((fovDeg * Math.PI) / 360) * distance) / viewportHeight
  return Math.min(4.2, Math.max(0.7, minPx * worldPerPx))
}

/** drei Text 的 characters，用来只预排这些字，避免回退字体。洽/丙始终编进子集。 */
export function roomLabelCharacters(labels: RoomLabel[]): string {
  return Array.from(new Set(`${labels.map((label) => label.text).join('')}洽丙嗆`)).join('')
}

/** 标准层：三间会议室、茶水间、前台、电梯厅。引线终点在房间上方。 */
export function towerRoomLabels(): RoomLabel[] {
  const meetings = MEETINGS.map((room, index) => {
    const center = aabbCenter(room)
    return {
      id: `tower-meeting-${index + 1}`,
      text: `会议室${index + 1}`,
      anchor: [center.x, 2.05, room.z1] as [number, number, number],
      label: [center.x, 3.2, center.z] as [number, number, number],
    }
  })
  const pantry = aabbCenter(PANTRY)
  const reception = aabbCenter(RECEPTION)
  return [
    ...meetings,
    {
      id: 'tower-pantry',
      text: '茶水间',
      anchor: [pantry.x, 1.7, pantry.z],
      label: [pantry.x, 3.15, pantry.z],
    },
    {
      id: 'tower-reception',
      text: '前台',
      anchor: [reception.x, 1.85, reception.z],
      label: [reception.x, 3.2, reception.z],
    },
    {
      id: 'tower-core',
      text: '电梯厅',
      anchor: [0, 2.15, CORE.z1 - 0.4],
      label: [0, 3.35, (CORE.z0 + CORE.z1) / 2],
    },
  ]
}

export function basementRoomLabels(): RoomLabel[] {
  const core = aabbCenter(B1_CORE)
  const kitchen = aabbCenter(KITCHEN)
  const canteen = canteenPadCenter()
  return [
    {
      id: 'b1-core',
      text: '电梯厅',
      anchor: [core.x, 2.1, core.z],
      label: [core.x, 3.3, core.z],
    },
    {
      id: 'b1-kitchen',
      text: '厨房',
      anchor: [kitchen.x, 1.8, kitchen.z],
      label: [kitchen.x, 3.15, kitchen.z],
    },
    {
      id: 'b1-canteen',
      text: '食堂',
      anchor: [canteen.x, 1.3, canteen.z],
      label: [canteen.x, 3.05, canteen.z],
    },
  ]
}
