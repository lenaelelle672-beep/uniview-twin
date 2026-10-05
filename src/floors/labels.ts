import type { RoomLabel } from '../scene/stage/roomLabels'
import type { FloorPlan, FloorRoom } from './types'

export const MAX_ROOM_LABELS = 24

const PRIORITY = [/电梯厅|核心筒/, /前台/, /茶水/, /会议/, /接待/, /大厅|大堂|中庭/, /展厅/, /食堂|餐厅/, /休息/, /实验/, /主管|办公/, /文档|档案|库房/]
const SKIP = /机房|设备区|空调|新风|网络|配电|弱电|水泵|上空|卫生|厕所|管井|风井|烟|取风|找坡|坡顶|坡底|^\d+#电梯/

function scoreRoom(room: FloorRoom): number | null {
  if (SKIP.test(room.name)) return null
  const index = PRIORITY.findIndex((pattern) => pattern.test(room.name))
  if (index >= 0) return index
  if (room.polygon && room.confidence !== 'none' && room.confidence !== 'low') return PRIORITY.length + 1
  return null
}

function displayName(name: string): string {
  if (/核心筒|电梯厅|合用前室/.test(name)) return '电梯厅'
  if (/茶水/.test(name)) return '茶水间'
  if (/前台/.test(name)) return '前台'
  if (/会议/.test(name)) return name.startsWith('会议') ? name.slice(0, 8) : '会议室'
  return name.length > 8 ? name.slice(0, 8) : name
}

export function roomLabelsFromPlan(plan: FloorPlan): RoomLabel[] {
  const ranked = plan.rooms
    .map((room) => ({ room, score: scoreRoom(room) }))
    .filter((item): item is { room: FloorRoom; score: number } => item.score != null)
    .sort((left, right) => left.score - right.score || left.room.name.localeCompare(right.room.name, 'zh'))

  const picked: FloorRoom[] = []
  const used = new Set<string>()
  for (const item of ranked) {
    const text = displayName(item.room.name)
    const key = `${text}@${item.room.label[0].toFixed(1)},${item.room.label[1].toFixed(1)}`
    if (used.has(text) && picked.length >= 6) continue
    if (used.has(key)) continue
    used.add(text)
    used.add(key)
    picked.push(item.room)
    if (picked.length >= MAX_ROOM_LABELS) break
  }

  return picked.map((room) => {
    const text = displayName(room.name)
    const [x, z] = room.label
    return {
      text,
      anchor: [x, 2.05, z],
      label: [x, 3.2, z],
    }
  })
}
