import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getFloorPlan } from './cache'
import { hydrateAllAboveGrade } from './hydrateForTests'
import { displayName, isRoomName, roomLabelsFromPlan, TIER2_REF_COUNTS, tier2RoomsFromPlan } from './labels'
import { readWoffCmapChars } from './fontCmap'
import { basementRoomLabels, roomLabelCharacters, ROOM_LABEL_PACK_EXTRA } from '../scene/stage/roomLabels'
import { clusterTemplates } from '../scene/stage/labelAvoidance'

hydrateAllAboveGrade()

const CAD_NOTES = [
  '详建施A-40-27',
  '200*200不锈钢柱',
  '3*2拼接屏1433*808',
  '每张测试桌配6个5孔插座、1个大网口',
  '测试桌地上预留5个插座+1个大网口',
  'IPX7/IPX8水桶',
  '干燥箱、紫外老化箱',
  '大干燥箱',
  '一体机选型',
  '饮水机',
  '直立式饮水机',
  '茶水柜',
  'XSIZE',
  'YSIZE',
  '(4KW）',
  '(12KW)',
  '3KW',
  '6kw',
  'HALT箱',
] as const

const CAD_FURNITURE_NOTES = [
  '测试桌',
  '测试整改桌',
  '温箱',
  '4插座2网口',
  '2插座1网口',
  '8插座4网口',
  '10插座5网口',
  '20插座10网口',
  '三相插座*2',
  '3个3插',
  '1个2插',
  '1个大网',
  '2个地漏',
  '预留电视机电源',
  '振动台',
  '仪器台面',
  '金相台面',
  '跌落台',
  '组网架',
  '货架',
  '货架1',
  '货架及',
  '泡棉货架',
  '通风柜通风柜',
  '主机',
  '显示屏',
  '双门冰箱',
  '微波炉*4',
  '微波炉*2',
  '吹风机',
  '三脚架',
  '观察台',
  '操作台',
  '会议桌',
  '机柜',
  '投影仪',
  '锅炉烟囱',
] as const

const EQUIPMENT_NOTES = ['饮水机', '一体机选型', '直立式饮水机', '茶水柜'] as const

const HEADCOUNT_NAMES = [
  '国内市场部（61+1+100+3=165人）',
  '国内市场部（160+5人）',
  '技术服务部（100+105+1人）',
  '财务部（88+16+1=101人）',
  '人力资源部（44+8+1人）',
  '供应链管理部（180+1人）',
  '国际市场部（176+5人）',
  '国际市场部（192+4人）',
  '备用办公层（160+5人）',
  '采购部（88+1人）',
  'IT部（96+1人）',
  'IT部（90+1人）',
] as const

const KEEP_ROOMS = [
  '洽谈室',
  '会议室A1',
  '一级主管办公室',
  '丙类储藏',
  '面试等候区/公共空间',
  '丙类公共事务部礼品房',
  '公共事务部礼品仓库',
  '临时存放物品周转区',
  '前段产品图像测试区',
  '技服培训室(120㎡）',
  '丙类仓库(30㎡）',
  '茶水间',
  '茶水',
  'UPS',
  'ITS',
  '1#楼梯',
  '核心筒（楼梯；XSIZE、YSIZE）',
  'OAA实验车间',
  'EMC实验车间',
  'X-RAY室',
  '待发PC区',
  '研发B区',
  'chart测试区',
  '打印',
  '茶水台',
  '会议室',
  '货架区',
] as const

/** 纯 ASCII 拿不准，D258 清单未列，先不滤。 */
const UNSURE_ASCII = ['-2~8', '1-5', '7(14)'] as const

const FONT_PATH = join(process.cwd(), 'public/fonts/NotoSansSC-Regular-subset.woff')

describe('D237 / D238 标签文本', () => {
  it('既有 CAD/设备/ASCII 注记被过滤，茶水间和 UPS 名字不受误伤', () => {
    expect(CAD_NOTES).toHaveLength(19)
    for (const name of CAD_NOTES) expect(isRoomName(name), name).toBe(false)
    for (const name of CAD_FURNITURE_NOTES) expect(isRoomName(name), name).toBe(false)
    for (const name of KEEP_ROOMS) expect(isRoomName(name), name).toBe(true)
    for (const name of HEADCOUNT_NAMES) expect(isRoomName(name), name).toBe(true)
    expect(isRoomName('茶水间')).toBe(true)
    expect(isRoomName('茶水')).toBe(true)
    expect(isRoomName('会议室A1')).toBe(true)
    for (const name of UNSURE_ASCII) expect(isRoomName(name), name).toBe(true)
  })

  it('D258 A 类 23 条：XSIZE/YSIZE/功率/HALT，UPS 只滤 F2 无多边形', () => {
    let ascii = 0
    for (let level = 1; level <= 8; level += 1) {
      const plan = getFloorPlan(`F${level}`)!
      for (const room of plan.rooms) {
        const dropped = !isRoomName(room.name, room)
        const size = room.name === 'XSIZE' || room.name === 'YSIZE'
        const power = /^[（(]?\d+\s*kw\s*[）)]?$/i.test(room.name)
        const halt = room.name.includes('HALT箱')
        const upsBare = room.name === 'UPS' && (!room.polygon || room.polygon.length < 3)
        if ((size || power || halt || upsBare) && dropped) ascii += 1
      }
    }
    expect(ascii).toBe(23)
    const f2 = getFloorPlan('F2')!
    const f3 = getFloorPlan('F3')!
    expect(f2.rooms.some((room) => room.name === 'UPS' && isRoomName(room.name, room))).toBe(false)
    expect(f3.rooms.some((room) => room.name === 'UPS' && isRoomName(room.name, room))).toBe(true)
    expect(isRoomName('UPS')).toBe(true)
    expect(isRoomName('核心筒（楼梯；XSIZE、YSIZE）')).toBe(true)
    expect(roomLabelsFromPlan(f2).some((label) => /^[XY]SIZE$/i.test(label.text))).toBe(false)
    const keep = [
      ['F1', 'OAA实验车间'],
      ['F1', 'EMC实验车间'],
      ['F1', 'X-RAY室'],
      ['F3', 'UPS'],
      ['F4', '待发PC区'],
      ['F4', '研发B区'],
      ['F5', 'ITS'],
      ['F6', 'chart测试区'],
    ] as const
    for (const [floorId, name] of keep) {
      const plan = getFloorPlan(floorId)!
      expect(
        plan.rooms.some((room) => room.name === name && isRoomName(room.name, room)),
        `${floorId} ${name}`,
      ).toBe(true)
    }
  })

  it('D258 B 类 128 条设备/家具被过滤，茶水台、打印间、会议室留下', () => {
    const furniture = new Set(CAD_FURNITURE_NOTES)
    let count = 0
    for (let level = 1; level <= 8; level += 1) {
      const plan = getFloorPlan(`F${level}`)!
      for (const room of plan.rooms) {
        if (isRoomName(room.name, room)) continue
        if (CAD_NOTES.includes(room.name as (typeof CAD_NOTES)[number])) continue
        if (
          furniture.has(room.name as (typeof CAD_FURNITURE_NOTES)[number]) ||
          /测试桌|测试整改桌|温箱|插座|网口|\d个\d插|1个大网|地漏|电视机电源|振动台|台面|跌落台|组网架|^货架\d*$|货架及|泡棉货架|通风柜|^主机$|^显示屏$|冰箱|微波炉|吹风机|三脚架|观察台|操作台|^会议桌$|^机柜$|投影仪|锅炉烟囱/.test(
            room.name,
          )
        ) {
          count += 1
        }
      }
    }
    expect(count).toBe(128)
    expect(isRoomName('茶水台')).toBe(true)
    expect(isRoomName('打印')).toBe(true)
    expect(isRoomName('会议室')).toBe(true)
    expect(isRoomName('货架区')).toBe(true)
    const f6 = getFloorPlan('F6')!
    expect(f6.rooms.some((room) => room.name === '茶水台' && isRoomName(room.name, room))).toBe(true)
    expect(f6.rooms.some((room) => room.name === '打印' && isRoomName(room.name, room))).toBe(true)
    expect(f6.rooms.some((room) => room.name === '会议桌' && isRoomName(room.name, room))).toBe(false)
    expect(tier2RoomsFromPlan(f6)).toHaveLength(TIER2_REF_COUNTS.F6!)
    expect(TIER2_REF_COUNTS.F6).toBe(16)
  })

  it('F2–F8 设备标注 49 条：饮水机 20、一体机选型 15、直立式饮水机 10、茶水柜 4', () => {
    const counts = { 饮水机: 0, 一体机选型: 0, 直立式饮水机: 0, 茶水柜: 0 }
    const perFloor: Record<string, number> = {}
    for (let level = 2; level <= 8; level += 1) {
      const floorId = `F${level}`
      let n = 0
      for (const room of getFloorPlan(floorId)!.rooms) {
        if (!EQUIPMENT_NOTES.includes(room.name as (typeof EQUIPMENT_NOTES)[number])) continue
        counts[room.name as keyof typeof counts] += 1
        n += 1
      }
      perFloor[floorId] = n
    }
    expect(counts).toEqual({ 饮水机: 20, 一体机选型: 15, 直立式饮水机: 10, 茶水柜: 4 })
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(49)
    expect(perFloor.F2).toBe(10)
    expect(perFloor.F3).toBe(22)
    for (const name of EQUIPMENT_NOTES) {
      expect(roomLabelsFromPlan(getFloorPlan('F3')!).some((label) => label.sourceName === name || label.text === name)).toBe(false)
    }
  })

  it('人数算式只在 displayName 去掉，原文仍是房间名', () => {
    expect(displayName('国内市场部（61+1+100+3=165人）')).toBe('国内市场部')
    expect(displayName('国内市场部（160+5人）')).toBe('国内市场部')
    expect(displayName('技术服务部（100+105+1人）')).toBe('技术服务部')
    expect(displayName('财务部（88+16+1=101人）')).toBe('财务部')
    expect(displayName('人力资源部（44+8+1人）')).toBe('人力资源部')
    expect(displayName('供应链管理部（180+1人）')).toBe('供应链管理部')
    expect(displayName('国际市场部（176+5人）')).toBe('国际市场部')
    expect(displayName('国际市场部（192+4人）')).toBe('国际市场部')
    expect(displayName('备用办公层（160+5人）')).toBe('备用办公层')
    expect(displayName('采购部（88+1人）')).toBe('采购部')
    expect(displayName('IT部（96+1人）')).toBe('IT部')
    expect(displayName('IT部（90+1人）')).toBe('IT部')
    expect(displayName('技服培训室(120㎡）')).toBe('技服培训室\n(120㎡）')
    expect(displayName('丙类仓库(30㎡）')).toBe('丙类仓库\n(30㎡）')
    expect(displayName('面试等候区/公共空间')).toBe('面试等候区/公共空间')
  })

  it('面积括号只在「(」前换行，括号整段在第二行', () => {
    const cases = ['技服培训室(120㎡）', '技服培训室(180㎡）', '丙类仓库(30㎡）'] as const
    for (const name of cases) {
      const shown = displayName(name)
      const lines = shown.split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).not.toMatch(/[（(]/)
      expect(lines[1]).toMatch(/^[（(]\d+㎡[）)]$/)
      expect(shown.startsWith('\n')).toBe(false)
    }
  })

  it('预排字符串去掉 × 和 嗆，只留 洽丙x0123456789', () => {
    expect(ROOM_LABEL_PACK_EXTRA).toBe('洽丙x0123456789')
    expect(ROOM_LABEL_PACK_EXTRA).not.toMatch(/[×嗆]/)
    const packed = roomLabelCharacters(roomLabelsFromPlan(getFloorPlan('F12')!))
    expect(packed).toMatch(/洽/)
    expect(packed).toMatch(/丙/)
    expect(packed).toMatch(/x/)
    expect(packed).not.toMatch(/[×嗆]/)
  })

  it('所有层显示文本、合组文案和 roomLabelCharacters 都在打包 woff 的 cmap 里', () => {
    const bytes = new Uint8Array(readFileSync(FONT_PATH))
    const cmap = readWoffCmapChars(bytes)
    expect(cmap.size).toBeGreaterThan(3000)
    expect(cmap.has('洽')).toBe(true)
    expect(cmap.has('丙')).toBe(true)
    expect(cmap.has('x')).toBe(true)
    expect(cmap.has('×')).toBe(false)
    expect(cmap.has('嗆')).toBe(false)

    const missing: string[] = []
    const check = (source: string, text: string) => {
      for (const char of text) {
        if (char.charCodeAt(0) < 32) continue
        if (!cmap.has(char)) missing.push(`${source} ${JSON.stringify(text)} 缺 ${JSON.stringify(char)}`)
      }
    }

    for (let level = 1; level <= 22; level += 1) {
      const floorId = `F${level}`
      const labels = roomLabelsFromPlan(getFloorPlan(floorId)!)
      for (const label of labels) check(`${floorId} label`, label.text)
      for (const cluster of clusterTemplates(labels)) check(`${floorId} cluster`, cluster.text)
      check(`${floorId} roomLabelCharacters`, roomLabelCharacters(labels))
    }
    const basement = basementRoomLabels()
    for (const label of basement) check('B1 label', label.text)
    check('B1 roomLabelCharacters', roomLabelCharacters(basement))
    expect(missing, missing.join('\n')).toEqual([])
  })
})
