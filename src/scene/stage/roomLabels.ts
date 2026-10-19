import { B1_CORE, CORE, KITCHEN, MEETINGS, PANTRY, RECEPTION, aabbCenter, canteenPadCenter } from './layout'

export interface RoomLabel {
  id: string
  text: string
  sourceName?: string
  anchor: [number, number, number]
  label: [number, number, number]
  area?: number
  polygon?: Array<[number, number]> | null
}

export const ROOM_LABEL_FONT = '/fonts/NotoSansSC-Regular-subset.woff'
/** D249：1366/1920 目标 16±1，1024 ≥15。替代 D221 的 14 px。 */
export const LABEL_MIN_PX = 15
export const LABEL_MAX_PX = 17
/** 深色字 + 浅色描边。perf 不走合成器，toneMapped=false 后就是这两个值。 */
export const ROOM_LABEL_COLOR = '#17324d'
export const ROOM_LABEL_OUTLINE_COLOR = '#ffffff'
/**
 * balanced/high 白天进合成器 AgX，曝光仍是 2（DayExposure 不动）。
 * 浅描边 #d8e2ec 过曝光 2 后落到 #d5d8db，和楼板 #e6e1d8 的输出 #d9d7d5 几乎等亮（对比约 1.0）。
 * 字色再压暗，描边改成冷灰蓝：实心描边过 AgX 后约 #3f5c72，和近黑字、浅楼板都能分开。
 * 夜间曝光是 1，浅描边才压得住深色地面，所以夜间沿用原来的一对。
 */
export const ROOM_LABEL_COLOR_BALANCED = '#010308'
export const ROOM_LABEL_OUTLINE_COLOR_BALANCED = '#263848'
export const ROOM_LABEL_COLOR_BALANCED_NIGHT = '#020910'
export const ROOM_LABEL_OUTLINE_COLOR_BALANCED_NIGHT = '#d8e2ec'
/** 0.055 em 的浅晕会糊笔画。0.05 em 的实心冷边只加一圈，不往字心摊。 */
export const ROOM_LABEL_OUTLINE_EM = 0.05
export const ROOM_LABEL_OUTLINE_MIN = 0.03
/** 白天描边若再和楼板预混，AgX 会把边抬回楼板亮度。不透明才留得住这圈冷边。 */
export const ROOM_LABEL_OUTLINE_OPACITY = 1
/**
 * T028：描边外缘软晕。troika 百分比相对 fontSize，不是相对 outlineWidth。
 * 10% 在 16px 标签上约 1.6px 模糊半径，只进 outline pass；字心填充仍走原来的抗锯齿。
 */
export const ROOM_LABEL_OUTLINE_BLUR = '10%'

export function roomLabelColors(
  quality: 'perf' | 'balanced' | 'high',
  tone: 'day' | 'night' = 'day',
): { color: string; outline: string } {
  if (quality === 'perf') return { color: ROOM_LABEL_COLOR, outline: ROOM_LABEL_OUTLINE_COLOR }
  if (tone === 'night') {
    return { color: ROOM_LABEL_COLOR_BALANCED_NIGHT, outline: ROOM_LABEL_OUTLINE_COLOR_BALANCED_NIGHT }
  }
  return { color: ROOM_LABEL_COLOR_BALANCED, outline: ROOM_LABEL_OUTLINE_COLOR_BALANCED }
}

export function roomLabelOutlineWidth(fontSize: number): number {
  return Math.max(ROOM_LABEL_OUTLINE_MIN, fontSize * ROOM_LABEL_OUTLINE_EM)
}

/** 按当前机位距离把世界字号夹到 [minPx, maxPx] 屏幕像素。近景不再用 0.7 m 地板撑大字。 */
export function worldFontSizeForDistance(
  distance: number,
  viewportHeight: number,
  fovDeg: number,
  minPx = LABEL_MIN_PX,
  maxPx = LABEL_MAX_PX,
): number {
  if (!Number.isFinite(distance) || distance <= 0 || viewportHeight <= 0) return 0.78
  const worldPerPx = (2 * Math.tan((fovDeg * Math.PI) / 360) * distance) / viewportHeight
  const minWorld = minPx * worldPerPx
  const maxWorld = maxPx * worldPerPx
  return Math.min(4.2, maxWorld, Math.max(minWorld, Math.min(0.7, maxWorld)))
}

/** 屏幕上与目标标记重叠或相邻的房间标签降透明度，不删标签。 */
export function labelFadeForTarget(
  label: { x: number; y: number },
  target: { x: number; y: number },
  labelPx: number,
  adjacentPx = 56,
): number {
  const reach = labelPx * 2.4 + adjacentPx
  return Math.hypot(label.x - target.x, label.y - target.y) < reach ? 0.22 : 1
}

/** 预排补集：洽/丙 + 合组用的 ASCII x 和数字。不追加 ×/嗆，避免子集外占位方块。 */
export const ROOM_LABEL_PACK_EXTRA = '洽丙x0123456789'

/** drei Text 的 characters，用来只预排这些字。 */
export function roomLabelCharacters(labels: RoomLabel[]): string {
  const raw = `${labels.map((label) => label.text).join('')}${ROOM_LABEL_PACK_EXTRA}`.replace(/[\u0000-\u001f]/g, '')
  return Array.from(new Set(raw)).join('')
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
