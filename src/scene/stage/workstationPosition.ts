import { floorSpec } from '../../data/floors'
import { layoutWorkstations, type Slot } from './layout'

/** 每层固定工位数。轮廓变化后仍要排满这个数量，且全部落在楼板内。 */
export const WORKSTATIONS_PER_FLOOR = 100

/**
 * 塔楼局部坐标，米。原点在塔楼平面中心、地面；+X 东，Y 上，-Z 北。
 * y 取该层标高。室内网格已经放在这一标高上，实例化时只用 x、z。
 */
export interface WorkstationPosition {
  x: number
  y: number
  z: number
}

const slotCache = new Map<string, Slot[]>()

function canonicalSlots(floorId: string): Slot[] {
  const cached = slotCache.get(floorId)
  if (cached) return cached
  const slots = layoutWorkstations(floorId, WORKSTATIONS_PER_FLOOR)
  if (slots.length !== WORKSTATIONS_PER_FLOOR) {
    throw new Error(`工位排不满：${floorId} 得到 ${slots.length}，需要 ${WORKSTATIONS_PER_FLOOR}`)
  }
  slotCache.set(floorId, slots)
  return slots
}

function slotIndex(floorId: string, workstationId: string): number {
  const match = new RegExp(`^${floorId}-([1-9]\\d*)$`).exec(workstationId)
  if (!match) throw new Error(`工位编号无法对应落点：${floorId} ${workstationId}`)
  const index = Number(match[1])
  if (index > WORKSTATIONS_PER_FLOOR) {
    throw new Error(`工位序号超出 1～${WORKSTATIONS_PER_FLOOR}：${workstationId}`)
  }
  return index - 1
}

/**
 * 工位落点的唯一来源（D027）。
 *
 * 模拟数据和 `?data=` 只提供楼层、编号和状态。数据里即使带了 x/y/z，也不得用来摆放。
 * 编号形如 `F12-66`、`B1-8`，末段是 1～100 的序号，对应本层固定的 100 个落点。
 *
 * 平面来自当前塔楼 / 地下室楼板轮廓。T002 返工如果改了轮廓，要按新轮廓重排，
 * 每层仍然是 100 个，并且都落在楼板以内。
 */
export function workstationPosition(floorId: string, workstationId: string): WorkstationPosition {
  const slot = canonicalSlots(floorId)[slotIndex(floorId, workstationId)]
  return { x: slot.x, y: floorSpec(floorId).elevation, z: slot.z }
}
