import type { RoomLabel } from '../scene/stage/roomLabels'
import type { FloorPlan, FloorRoom } from './types'

const PRIORITY = [
  /电梯厅|核心筒|合用前室/,
  /前台/,
  /茶水/,
  /会议/,
  /洽谈/,
  /接待/,
  /大厅|大堂|中庭/,
  /展厅/,
  /食堂|餐厅/,
  /休息/,
  /实验/,
  /主管|办公/,
  /文档|档案|库房|储藏/,
  /打印/,
]

/**
 * 非房间标注：机电风口/电井、卫生间符号、门洞尺寸、常开常闭、单字母代号。
 * 只挂房间名，这类 CAD 残留不进标签。不过滤条数、不按同名截断。
 */
const ANNOTATION =
  /尾气|强电|弱电|送风|排风|补风|新风|排烟|油烟|空调|暖通|水泵|配电|机房|设备|管井|风井|烟井|取风|门洞|常开|常闭|尺寸|上空|找坡|坡顶|坡底|防火隔墙|卫生|厕所|网络机房|加压|暗门/
const SKIP_ELEVATOR = /^\d+#电梯/
const MARKER = /^(女|男|P|N|W|p)$/
const NUMERIC = /^[\d.#＋+\s]+$/

export function isRoomName(name: string): boolean {
  const text = name.trim()
  if (text.length === 0) return false
  if (MARKER.test(text)) return false
  if (NUMERIC.test(text)) return false
  if (SKIP_ELEVATOR.test(text)) return false
  if (/[（(]常开[）)]/.test(text) && text.replace(/[（()）常开\s]/g, '').length === 0) return false
  if (ANNOTATION.test(text)) return false
  return true
}

function scoreRoom(room: FloorRoom): number {
  const index = PRIORITY.findIndex((pattern) => pattern.test(room.name))
  return index >= 0 ? index : PRIORITY.length
}

export function displayName(name: string): string {
  if (/核心筒|电梯厅|合用前室/.test(name)) return '电梯厅'
  if (/茶水/.test(name)) return '茶水间'
  if (/前台/.test(name)) return '前台'
  if (/洽谈/.test(name)) return '洽谈室'
  if (/会议/.test(name)) return name.startsWith('会议') ? name : '会议室'
  return name
}

function ringArea(ring: Array<[number, number]> | null | undefined): number {
  if (!ring || ring.length < 3) return 0
  let sum = 0
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    sum += ring[prev][0] * ring[index][1] - ring[index][0] * ring[prev][1]
  }
  return Math.abs(sum) / 2
}

export interface RoomLabelFilterStats {
  floorId: string
  before: number
  after: number
  shown: number
  dropped: string[]
}

export function roomNamesFromPlan(plan: FloorPlan): FloorRoom[] {
  return plan.rooms
    .filter((room) => isRoomName(room.name))
    .slice()
    .sort((left, right) => scoreRoom(left) - scoreRoom(right) || left.name.localeCompare(right.name, 'zh'))
}

export function roomLabelFilterStats(plan: FloorPlan): RoomLabelFilterStats {
  const dropped = plan.rooms.filter((room) => !isRoomName(room.name)).map((room) => room.name)
  const labels = roomLabelsFromPlan(plan)
  return {
    floorId: plan.floorId,
    before: plan.rooms.length,
    after: plan.rooms.length - dropped.length,
    shown: labels.length,
    dropped: [...new Set(dropped)],
  }
}

export function roomLabelsFromPlan(plan: FloorPlan): RoomLabel[] {
  const rooms = roomNamesFromPlan(plan)
  const used = new Set<string>()
  return rooms.map((room, index) => {
    const [x, z] = room.label
    let id = `${plan.floorId}:${room.id}`
    if (used.has(id)) id = `${id}:${index}`
    used.add(id)
    return {
      id,
      text: displayName(room.name),
      anchor: [x, 2.05, z] as [number, number, number],
      label: [x, 3.2, z] as [number, number, number],
      area: ringArea(room.polygon),
      polygon: room.polygon,
    }
  })
}
