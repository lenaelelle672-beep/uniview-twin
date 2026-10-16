import { floorDeskCount } from '../floors/deskCounts'
import { workstationPosition } from '../scene/stage/workstationPosition'

const REF_RE = /^(B1|F(?:[1-9]|1\d|2[0-2]))-(\d{1,4})$/

export interface WorkstationRef {
  floorId: string
  deskId: string
  index: number
}

/** 工位号只接受 B1 / F1～F22，序号为本层图纸工位数。非法编号返回 null，不抛错。 */
export function resolveWorkstationRef(raw: string): WorkstationRef | null {
  const match = REF_RE.exec(raw.trim())
  if (!match) return null
  const floorId = match[1]
  const index = Number(match[2])
  if (!Number.isInteger(index) || index < 1 || index > floorDeskCount(floorId)) return null
  return { floorId, deskId: `${floorId}-${index}`, index }
}

function ipPair(index: number): { lo: number; hi: number } {
  const hi = Math.floor((index - 1) / 250)
  const lo = ((index - 1) % 250) + 1
  return { hi, lo }
}

/** 电脑与 IP 电话的地址由楼层和工位序号决定，不读数据坐标。 */
export function workstationIps(floorId: string, deskId: string): { pc: string; phone: string } {
  const ref = resolveWorkstationRef(deskId)
  if (!ref || ref.floorId !== floorId) {
    throw new Error(`工位编号无法对应地址：${floorId} ${deskId}`)
  }
  const level = floorId === 'B1' ? 0 : Number(floorId.slice(1))
  const { hi, lo } = ipPair(ref.index)
  return {
    pc: `10.${level}.${hi}.${lo}`,
    phone: `10.${level}.${hi + 1}.${lo}`,
  }
}

export function invalidPosMessage(raw: string): string {
  return `找不到工位 ${raw}。编号需为 B1 或 F1～F22，序号为本层工位号，例如 F12-66。`
}

/** 数值与单位之间的不换行空格，避免窄详情栏把「52.86 m」拆开（A19 / T16R-01）。 */
const METER_UNIT = '\u00A0m'

export function formatWorkstationPlace(floorId: string, deskId: string): string {
  try {
    const place = workstationPosition(floorId, deskId)
    return `东 ${place.x.toFixed(2)}${METER_UNIT}，标高 ${place.y.toFixed(2)}${METER_UNIT}，北 ${(-place.z).toFixed(2)}${METER_UNIT}`
  } catch {
    return '按图纸工位'
  }
}
