import { DEVICE_TYPE_LABEL, STATUS_LABEL } from '../../alarms/labels'
import { listFloorSpecs } from '../../data/floors'
import { roomLabelsFromPlan } from '../../floors/labels'
import { peekFloorPlan } from '../../floors/loadFloor'
import { useTwinStore } from '../../store/store'
import { basementRoomLabels, roomLabelCharacters, towerRoomLabels } from '../stage/roomLabels'

/** 演示主线进层顺序。预热按这个顺序覆盖这些层用到的字形和材质。 */
export const DEMO_PREWARM_FLOORS = ['F12', 'F22', 'F18', 'F3', 'F1'] as const

/**
 * 构建时从 F12/F22/F18/F3/F1 图纸 displayName 抽出的房间文案。
 * 运行时图纸还没加载，先用这份，避免预热去拉 JSON。
 */
export const DEMO_ROOM_LABEL_TEXTS = [
  '电梯厅',
  '茶水间',
  '前台',
  '洽谈室',
  '会议室',
  '多功能室',
  '文档室',
  '档案室',
  '茶室',
  '采购部（88+',
  'IT部（96+1',
  '一级主管办',
  '主管办公室',
  '观景平台',
  '备用办公层（',
  '备用间',
  '备用',
  '备用办公',
  '实验室01',
  '实验室02',
  '实验室03',
  '实验室04',
  '技术服务部（',
  '库房',
  '行政仓库',
  '讲师等待室',
  '教师休息室',
  '技服培训室(12',
  '丙类仓库',
  '客户休息室',
  '办公区',
  '资料室',
  '外廊',
  '门厅',
  '生产大厅',
  '文印区',
  '入职体验办理',
  '收发室',
  '面试入口门厅',
  '门岗',
  '夹层',
  '开关站',
  'OAA实验车',
] as const

const EXTRA_GLYPHS = '洽丙嗆'

export function uniqueCharacters(text: string): string {
  return Array.from(new Set(text.replace(/\s/g, ''))).join('')
}

function storeTexts(): string {
  try {
    const state = useTwinStore.getState()
    const floors = state.floors.map((floor) => `${floor.id}${floor.name}`).join('')
    const alarms = state.alarms.map((alarm) => alarm.message).join('')
    const devices = state.devices.map((device) => device.id).join('')
    return `${floors}${alarms}${devices}`
  } catch {
    return ''
  }
}

function loadedPlanTexts(): string {
  return DEMO_PREWARM_FLOORS.flatMap((floorId) => {
    const plan = peekFloorPlan(floorId)
    return plan ? roomLabelsFromPlan(plan).map((label) => label.text) : []
  }).join('')
}

/** 每次空闲只预热这一小片字形，有输入就由 IdlePrewarm 让出。 */
export const GLYPH_PREWARM_CHUNK = 8

export function chunkCharacters(text: string, chunkSize = GLYPH_PREWARM_CHUNK): string[] {
  const glyphs = Array.from(uniqueCharacters(text))
  const chunks: string[] = []
  for (let index = 0; index < glyphs.length; index += chunkSize) {
    chunks.push(glyphs.slice(index, index + chunkSize).join(''))
  }
  return chunks
}

/**
 * 主线 5 层房间名优先，再补楼层名/告警文案。运行时图纸未到时用 DEMO_ROOM_LABEL_TEXTS。
 */
export function collectPrewarmCharacterChunks(chunkSize = GLYPH_PREWARM_CHUNK): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (text: string) => {
    for (const glyph of uniqueCharacters(text)) {
      if (seen.has(glyph)) continue
      seen.add(glyph)
      ordered.push(glyph)
    }
  }
  for (const floorId of DEMO_PREWARM_FLOORS) {
    const plan = peekFloorPlan(floorId)
    if (plan) push(roomLabelsFromPlan(plan).map((label) => label.text).join(''))
  }
  push(DEMO_ROOM_LABEL_TEXTS.join(''))
  push(collectPrewarmCharacters())
  return chunkCharacters(ordered.join(''), chunkSize)
}

/** 房间名 + 楼层名 + 告警文案。字体参数与 RoomLabels 相同，多出来的字只增加空闲时 SDF。 */
export function collectPrewarmCharacters(extra = ''): string {
  const roomPack = roomLabelCharacters([
    ...towerRoomLabels(),
    ...basementRoomLabels(),
    ...DEMO_ROOM_LABEL_TEXTS.map((text, index) => ({
      id: `demo-${index}`,
      text,
      anchor: [0, 0, 0] as [number, number, number],
      label: [0, 0, 0] as [number, number, number],
    })),
  ])
  const floors = listFloorSpecs()
    .map((spec) => `${spec.id}${spec.name}`)
    .join('')
  const alarms = `${Object.values(DEVICE_TYPE_LABEL).join('')}${Object.values(STATUS_LABEL).join('')}全部楼层`
  return uniqueCharacters(
    `${roomPack}${floors}${alarms}${loadedPlanTexts()}${storeTexts()}${EXTRA_GLYPHS}${extra}`,
  )
}
