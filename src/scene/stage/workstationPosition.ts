import { floorDeskCount } from '../../floors/deskCounts'
import { getFloorSlots } from '../../floors/cache'
import { floorSpec } from '../../data/floors'
import { layoutWorkstations, type Slot } from './layout'

/** B1 仍是 100。地上层以图纸工位数为准，请用 floorDeskCount / workstationsOnFloor。 */
export const WORKSTATIONS_PER_FLOOR = 100

export function workstationsOnFloor(floorId: string): number {
  return floorDeskCount(floorId)
}

/**
 * 塔楼局部坐标，米。原点在塔楼平面中心、地面；+X 东，Y 上，-Z 北。
 * y 取该层标高。室内网格已经放在这一标高上，实例化时只用 x、z。
 */
export interface WorkstationPosition {
  x: number
  y: number
  z: number
  rot: number
}

const slotCache = new Map<string, Slot[]>()

function basementSlots(): Slot[] {
  const cached = slotCache.get('B1')
  if (cached) return cached
  const slots = layoutWorkstations('B1', WORKSTATIONS_PER_FLOOR)
  if (slots.length !== WORKSTATIONS_PER_FLOOR) {
    throw new Error(`工位排不满：B1 得到 ${slots.length}，需要 ${WORKSTATIONS_PER_FLOOR}`)
  }
  slotCache.set('B1', slots)
  return slots
}

function canonicalSlots(floorId: string): Slot[] {
  if (floorId === 'B1') return basementSlots()
  const slots = getFloorSlots(floorId)
  if (!slots) throw new Error(`楼层图纸尚未加载：${floorId}`)
  return slots
}

function slotIndex(floorId: string, workstationId: string, count: number): number {
  const match = new RegExp(`^${floorId}-([1-9]\\d*)$`).exec(workstationId)
  if (!match) throw new Error(`工位编号无法对应落点：${floorId} ${workstationId}`)
  const index = Number(match[1])
  if (index > count) {
    throw new Error(`工位序号超出 1～${count}：${workstationId}`)
  }
  return index - 1
}

/**
 * 工位落点的唯一来源（D027）。
 *
 * 模拟数据和 `?data=` 只提供楼层、编号和状态。数据里即使带了 x/y/z，也不得用来摆放。
 * 编号形如 `F12-66`、`B1-8`，末段是该层图纸里的序号。
 * 地上层读 Fxx.json；B1 仍按现有楼板公式排 100 个。
 */
export function workstationPosition(floorId: string, workstationId: string): WorkstationPosition {
  const slots = canonicalSlots(floorId)
  const slot = slots[slotIndex(floorId, workstationId, slots.length)]
  return { x: slot.x, y: floorSpec(floorId).elevation, z: slot.z, rot: slot.rot }
}
