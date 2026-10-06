import { B1_CORE, CORE, KITCHEN, MEETINGS, PANTRY, RECEPTION, aabbCenter, canteenPadCenter } from './layout'

export interface RoomLabel {
  text: string
  anchor: [number, number, number]
  label: [number, number, number]
}

export const ROOM_LABEL_FONT = '/fonts/NotoSansSC-Regular-subset.otf'

/** drei Text 的 characters，用来只预排这些字，避免回退字体。 */
export function roomLabelCharacters(labels: RoomLabel[]): string {
  return Array.from(new Set(labels.map((label) => label.text).join(''))).join('')
}

/** 标准层：三间会议室、茶水间、前台、电梯厅。引线终点在房间上方。 */
export function towerRoomLabels(): RoomLabel[] {
  const meetings = MEETINGS.map((room, index) => {
    const center = aabbCenter(room)
    return {
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
      text: '茶水间',
      anchor: [pantry.x, 1.7, pantry.z],
      label: [pantry.x, 3.15, pantry.z],
    },
    {
      text: '前台',
      anchor: [reception.x, 1.85, reception.z],
      label: [reception.x, 3.2, reception.z],
    },
    {
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
      text: '电梯厅',
      anchor: [core.x, 2.1, core.z],
      label: [core.x, 3.3, core.z],
    },
    {
      text: '厨房',
      anchor: [kitchen.x, 1.8, kitchen.z],
      label: [kitchen.x, 3.15, kitchen.z],
    },
    {
      text: '食堂',
      anchor: [canteen.x, 1.3, canteen.z],
      label: [canteen.x, 3.05, canteen.z],
    },
  ]
}
