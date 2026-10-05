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

function displayName(name: string): string {
  if (/核心筒|电梯厅|合用前室/.test(name)) return '电梯厅'
  if (/茶水/.test(name)) return '茶水间'
  if (/前台/.test(name)) return '前台'
  if (/洽谈/.test(name)) return '洽谈室'
  if (/会议/.test(name)) return name.startsWith('会议') ? name.slice(0, 8) : '会议室'
  return name.length > 8 ? name.slice(0, 8) : name
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

/** 重名只靠稳定 id 和就近散开，不删。位移钳在锚点附近，避免大批标签被斥力推出楼板。 */
function separateEndpoints(labels: RoomLabel[], minSep: number): RoomLabel[] {
  const maxDrift = Math.min(8, Math.max(3.2, minSep * 0.85))
  const next = labels.map((label, index) => {
    const angle = (index / Math.max(labels.length, 1)) * Math.PI * 2
    const ring = Math.min(minSep * 0.22, 1.4)
    return {
      ...label,
      label: [
        label.anchor[0] + Math.cos(angle) * ring,
        3.2 + (index % 3) * 0.28,
        label.anchor[2] + Math.sin(angle) * ring,
      ] as [number, number, number],
    }
  })
  for (let iter = 0; iter < 10; iter += 1) {
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
  for (const label of next) {
    const dx = label.label[0] - label.anchor[0]
    const dz = label.label[2] - label.anchor[2]
    const drift = Math.hypot(dx, dz)
    if (drift <= maxDrift) continue
    const scale = maxDrift / drift
    label.label[0] = label.anchor[0] + dx * scale
    label.label[2] = label.anchor[2] + dz * scale
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
  const span = outlineSpan(plan.outline)
  const density = Math.max(rooms.length, 1)
  const minSep = Math.max(2.4, (span > 70 ? 7.2 : 4.2) / Math.sqrt(density / 12))
  const labels = rooms.map((room, index) => {
    const [x, z] = room.label
    let id = `${plan.floorId}:${room.id}`
    if (used.has(id)) id = `${id}:${index}`
    used.add(id)
    return {
      id,
      text: displayName(room.name),
      anchor: [x, 2.05, z] as [number, number, number],
      label: [x, 3.2, z] as [number, number, number],
    }
  })
  return separateEndpoints(labels, minSep)
}
