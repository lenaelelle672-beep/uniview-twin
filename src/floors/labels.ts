import type { RoomLabel } from '../scene/stage/roomLabels'
import type { FloorPlan, FloorRoom } from './types'

/** 每层最多挂这么多房间名。每个 Text 是一次绘制，要给 officeDesks 和余量留调用。 */
export const MAX_ROOM_LABELS = 10

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
 * 只挂房间名，这类 CAD 残留不进标签。
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

function scoreRoom(room: FloorRoom): number | null {
  if (!isRoomName(room.name)) return null
  const index = PRIORITY.findIndex((pattern) => pattern.test(room.name))
  if (index >= 0) return index
  if (room.polygon && room.confidence !== 'none' && room.confidence !== 'low') return PRIORITY.length + 1
  return null
}

function displayName(name: string): string {
  if (/核心筒|电梯厅|合用前室/.test(name)) return '电梯厅'
  if (/茶水/.test(name)) return '茶水间'
  if (/前台/.test(name)) return '前台'
  if (/洽谈/.test(name)) return '洽谈室'
  if (/会议/.test(name)) return name.startsWith('会议') ? name.slice(0, 8) : '会议室'
  return name.length > 8 ? name.slice(0, 8) : name
}

function sameNameCap(text: string): number {
  if (text === '会议室') return 2
  if (text === '洽谈室' || text === '茶水间') return 2
  if (text === '电梯厅' || text === '前台') return 1
  return 1
}

function outlineSpan(outline: Array<[number, number]>): number {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of outline) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return Math.max(maxX - minX, maxZ - minZ)
}

function separateEndpoints(labels: RoomLabel[], minSep: number): RoomLabel[] {
  const next = labels.map((label, index) => {
    const angle = (index / Math.max(labels.length, 1)) * Math.PI * 2
    const ring = minSep * 0.55
    return {
      ...label,
      label: [
        label.anchor[0] + Math.cos(angle) * ring,
        3.2 + (index % 2) * 0.55,
        label.anchor[2] + Math.sin(angle) * ring,
      ] as [number, number, number],
    }
  })
  for (let iter = 0; iter < 14; iter += 1) {
    let moved = false
    for (let i = 0; i < next.length; i += 1) {
      for (let j = i + 1; j < next.length; j += 1) {
        const dx = next[j].label[0] - next[i].label[0]
        const dz = next[j].label[2] - next[i].label[2]
        const dist = Math.hypot(dx, dz)
        if (dist >= minSep) continue
        const nx = dist < 1e-6 ? Math.cos((i + 0.5) * 1.7) : dx / dist
        const nz = dist < 1e-6 ? Math.sin((i + 0.5) * 1.7) : dz / dist
        const push = (minSep - Math.max(dist, 0.2)) / 2
        next[i].label[0] -= nx * push
        next[i].label[2] -= nz * push
        next[j].label[0] += nx * push
        next[j].label[2] += nz * push
        moved = true
      }
    }
    if (!moved) break
  }
  return next
}

export interface RoomLabelFilterStats {
  floorId: string
  before: number
  after: number
  shown: number
  dropped: string[]
}

export function roomLabelFilterStats(plan: FloorPlan): RoomLabelFilterStats {
  const dropped = plan.rooms.filter((room) => !isRoomName(room.name)).map((room) => room.name)
  return {
    floorId: plan.floorId,
    before: plan.rooms.length,
    after: plan.rooms.length - dropped.length,
    shown: roomLabelsFromPlan(plan).length,
    dropped: [...new Set(dropped)],
  }
}

export function roomLabelsFromPlan(plan: FloorPlan): RoomLabel[] {
  const ranked = plan.rooms
    .map((room) => ({ room, score: scoreRoom(room) }))
    .filter((item): item is { room: FloorRoom; score: number } => item.score != null)
    .sort((left, right) => left.score - right.score || left.room.name.localeCompare(right.room.name, 'zh'))

  const picked: FloorRoom[] = []
  const usedSpot = new Set<string>()
  const usedName = new Map<string, number>()
  for (const item of ranked) {
    const text = displayName(item.room.name)
    const spot = `${text}@${item.room.label[0].toFixed(2)},${item.room.label[1].toFixed(2)}`
    if (usedSpot.has(spot)) continue
    const count = usedName.get(text) ?? 0
    if (count >= sameNameCap(text)) continue
    usedSpot.add(spot)
    usedName.set(text, count + 1)
    picked.push(item.room)
    if (picked.length >= MAX_ROOM_LABELS) break
  }

  const span = outlineSpan(plan.outline)
  const labels = picked.map((room) => {
    const text = displayName(room.name)
    const [x, z] = room.label
    return {
      id: `${plan.floorId}:${room.id}`,
      text,
      anchor: [x, 2.05, z] as [number, number, number],
      label: [x, 3.2, z] as [number, number, number],
    }
  })
  return separateEndpoints(labels, span > 70 ? 16 : 7.2)
}
