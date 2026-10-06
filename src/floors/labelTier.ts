/** D247 / D248：房间标签按地图分级。第一级（告警/选中/搜索）在运行时锁定，不走本函数。 */

export const LABEL_TIER2_AREA = 40

/** 名称命中即第二级。面积按 多边形 → labelArea_m2 → 名字㎡，≥40 另算。 */
export const LABEL_TIER2_NAME_RULES = [
  { rule: 'department', pattern: /部|中心|研发|事业|办公区/, label: '部门（部/中心/研发/事业/办公区，或人数括号）' },
  { rule: 'meeting', pattern: /会议/, label: '会议室' },
  { rule: 'training', pattern: /培训/, label: '培训室' },
  { rule: 'hall', pattern: /展厅/, label: '展厅' },
  { rule: 'reception', pattern: /接待/, label: '接待' },
  { rule: 'front', pattern: /前台/, label: '前台' },
  { rule: 'lobby', pattern: /大厅|大堂|中庭/, label: '大厅/大堂/中庭' },
  { rule: 'canteen', pattern: /食堂|餐厅/, label: '食堂/餐厅' },
] as const

export type LabelTier = 2 | 3
export type LabelTierRule = (typeof LABEL_TIER2_NAME_RULES)[number]['rule'] | 'area' | 'minor'

export const HEADCOUNT = /[（(][\d＋+\s=]*\d[\d＋+\s=]*人[）)]/
const NAMED_AREA = /[（(](\d+(?:\.\d+)?)\s*㎡[）)]/

export function namedAreaM2(name: string): number {
  const match = name.match(NAMED_AREA)
  return match ? Number(match[1]) : 0
}

export function ringAreaM2(ring: Array<[number, number]> | null | undefined): number {
  if (!ring || ring.length < 3) return 0
  let sum = 0
  for (let index = 0, prev = ring.length - 1; index < ring.length; prev = index, index += 1) {
    sum += ring[prev]![0] * ring[index]![1] - ring[index]![0] * ring[prev]![1]
  }
  return Math.abs(sum) / 2
}

/** 多边形面积 → 房间数据 labelArea_m2 → 名字括号里的㎡。 */
export function roomAreaM2(name: string, polygonArea = 0, labelArea: number | null | undefined = null): number {
  if (polygonArea > 0) return polygonArea
  if (labelArea != null && labelArea > 0) return labelArea
  return namedAreaM2(name)
}

export function roomNameHead(name: string): string {
  return name.replace(HEADCOUNT, '').replace(NAMED_AREA, '').replace(/[（()）]/g, '').trim()
}

export function isDepartmentName(name: string): boolean {
  return /部|中心|研发|事业|办公区/.test(name) || HEADCOUNT.test(name)
}

export interface LabelTierResult {
  tier: LabelTier
  rule: LabelTierRule
  area: number
}

export function classifyRoomLabel(
  name: string,
  polygonArea = 0,
  labelArea: number | null | undefined = null,
): LabelTierResult {
  const area = roomAreaM2(name, polygonArea, labelArea)
  if (isDepartmentName(name)) return { tier: 2, rule: 'department', area }
  for (const item of LABEL_TIER2_NAME_RULES) {
    if (item.rule === 'department') continue
    if (item.pattern.test(name)) return { tier: 2, rule: item.rule, area }
  }
  if (area >= LABEL_TIER2_AREA) return { tier: 2, rule: 'area', area }
  return { tier: 3, rule: 'minor', area }
}

export interface Tier2RoomRow {
  id: string
  name: string
  area: number
  rule: LabelTierRule
}

export function listTier2Rooms(
  rooms: ReadonlyArray<{
    id: string
    name: string
    polygon?: Array<[number, number]> | null
    labelArea_m2?: number | null
  }>,
): Tier2RoomRow[] {
  const rows: Tier2RoomRow[] = []
  for (const room of rooms) {
    const found = classifyRoomLabel(room.name, ringAreaM2(room.polygon), room.labelArea_m2)
    if (found.tier !== 2) continue
    rows.push({ id: room.id, name: room.name, area: Number(found.area.toFixed(1)), rule: found.rule })
  }
  return rows.sort((left, right) => left.name.localeCompare(right.name, 'zh') || left.id.localeCompare(right.id))
}
