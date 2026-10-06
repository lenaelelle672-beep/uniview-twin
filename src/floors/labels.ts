import type { RoomLabel } from '../scene/stage/roomLabels'
import { labelLiftY } from './interiorWall'
import { listTier2Rooms, roomAreaM2 } from './labelTier'
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
/** CAD 注记：图纸编号/型钢柱/拼接屏/插座预留/IPX/老化箱/D258 A 类 ASCII。 */
const CAD_NOTE = [
  /详建施[A-Za-z]?-\d+-\d+/,
  /\d+\*\d+不锈钢/,
  /\d+\*\d+拼接屏/,
  /测试桌.*(?:插座|网口)/,
  /IPX\d/,
  /干燥箱|紫外老化箱/,
  /一体机|饮水机|茶水柜/,
  /^[XY]SIZE$/,
  /^[（(]?\d+\s*kw\s*[）)]?$/i,
  /HALT箱/,
]
/**
 * D258 B 类设备/家具。会议桌精确匹配；不过滤 茶水台、打印、会议室。
 * 货架不写裸 /货架/，避免误伤「货架区」。
 */
const CAD_FURNITURE = [
  /测试桌|测试整改桌/,
  /温箱/,
  /插座|网口|\d个\d插|1个大网/,
  /^2个地漏$/,
  /预留电视机电源/,
  /振动台/,
  /仪器台面|金相台面|跌落台/,
  /泡棉货架|^货架\d*$|^货架及$/,
  /组网架/,
  /通风柜/,
  /^主机$/,
  /^显示屏$/,
  /冰箱/,
  /微波炉/,
  /吹风机/,
  /三脚架|观察台|操作台/,
  /^会议桌$/,
  /^机柜$/,
  /投影仪/,
  /锅炉烟囱/,
]
/** 部门名后的人数算式，只在 displayName 去掉。 */
const HEADCOUNT = /[（(][\d＋+\s=]*\d[\d＋+\s=]*人[）)]/g
/** 面积括号整段不拆，只在括号前硬换行。troika normal 会尊重 \\n，不占字形。 */
const AREA_BRACKET = /(?<!\n)([（(]\d+\s*㎡[）)])/g

export function keepAreaBracketTogether(text: string): string {
  return text.replace(AREA_BRACKET, '\n$1')
}

export function isRoomName(name: string, room?: Pick<FloorRoom, 'polygon'> | null): boolean {
  const text = name.trim()
  if (text.length === 0) return false
  if (MARKER.test(text)) return false
  if (NUMERIC.test(text)) return false
  if (SKIP_ELEVATOR.test(text)) return false
  if (/[（(]常开[）)]/.test(text) && text.replace(/[（()）常开\s]/g, '').length === 0) return false
  if (ANNOTATION.test(text)) return false
  if (CAD_NOTE.some((pattern) => pattern.test(text))) return false
  if (CAD_FURNITURE.some((pattern) => pattern.test(text))) return false
  if (text === 'UPS' && room && (!room.polygon || room.polygon.length < 3)) return false
  return true
}

function scoreRoom(room: FloorRoom): number {
  const index = PRIORITY.findIndex((pattern) => pattern.test(room.name))
  return index >= 0 ? index : PRIORITY.length
}

export function displayName(name: string): string {
  const text = name.replace(HEADCOUNT, '').trim()
  if (/核心筒|电梯厅|合用前室/.test(text)) return '电梯厅'
  if (/茶水/.test(text)) return '茶水间'
  if (/前台/.test(text)) return '前台'
  if (/洽谈/.test(text)) return '洽谈室'
  if (/会议/.test(text)) return text.startsWith('会议') ? text : '会议室'
  return keepAreaBracketTogether(text)
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
    .filter((room) => isRoomName(room.name, room))
    .slice()
    .sort((left, right) => scoreRoom(left) - scoreRoom(right) || left.name.localeCompare(right.name, 'zh'))
}

export function roomLabelFilterStats(plan: FloorPlan): RoomLabelFilterStats {
  const dropped = plan.rooms.filter((room) => !isRoomName(room.name, room)).map((room) => room.name)
  const labels = roomLabelsFromPlan(plan)
  return {
    floorId: plan.floorId,
    before: plan.rooms.length,
    after: plan.rooms.length - dropped.length,
    shown: labels.length,
    dropped: [...new Set(dropped)],
  }
}

export function tier2RoomsFromPlan(plan: FloorPlan) {
  return listTier2Rooms(roomNamesFromPlan(plan)).map((row) => ({
    id: `${plan.floorId}:${row.id}`,
    name: row.name,
    area: row.area,
    rule: row.rule,
  }))
}

export const TIER2_REF_COUNTS: Record<string, number> = {
  F1: 28,
  F2: 35,
  F3: 29,
  F4: 24,
  F5: 20,
  F6: 16,
  F7: 14,
  F8: 4,
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
      sourceName: room.name,
      anchor: [x, 2.05, z] as [number, number, number],
      label: [x, labelLiftY(0.78), z] as [number, number, number],
      area: roomAreaM2(room.name, ringArea(room.polygon), room.labelArea_m2),
      polygon: room.polygon,
    }
  })
}
