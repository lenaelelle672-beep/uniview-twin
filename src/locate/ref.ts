import { WORKSTATIONS_PER_FLOOR, workstationPosition } from '../scene/stage/workstationPosition'

const REF_RE = /^(B1|F(?:[1-9]|1\d|2[0-2]))-(\d{1,4})$/

export interface WorkstationRef {
  floorId: string
  deskId: string
  index: number
}

/** 工位号只接受 B1 / F1～F22，序号 1～100。非法编号返回 null，不抛错。 */
export function resolveWorkstationRef(raw: string): WorkstationRef | null {
  const match = REF_RE.exec(raw.trim())
  if (!match) return null
  const index = Number(match[2])
  if (!Number.isInteger(index) || index < 1 || index > WORKSTATIONS_PER_FLOOR) return null
  return { floorId: match[1], deskId: `${match[1]}-${index}`, index }
}

/** 电脑与 IP 电话的地址由楼层和工位序号决定，不读数据坐标。 */
export function workstationIps(floorId: string, deskId: string): { pc: string; phone: string } {
  const ref = resolveWorkstationRef(deskId)
  if (!ref || ref.floorId !== floorId) {
    throw new Error(`工位编号无法对应地址：${floorId} ${deskId}`)
  }
  const level = floorId === 'B1' ? 0 : Number(floorId.slice(1))
  return {
    pc: `10.${level}.0.${ref.index}`,
    phone: `10.${level}.1.${ref.index}`,
  }
}

export function invalidPosMessage(raw: string): string {
  return `找不到工位 ${raw}。编号需为 B1 或 F1～F22，序号 1～100，例如 F12-66。`
}

export function formatWorkstationPlace(floorId: string, deskId: string): string {
  const place = workstationPosition(floorId, deskId)
  return `东 ${place.x.toFixed(2)} m，标高 ${place.y.toFixed(2)} m，北 ${(-place.z).toFixed(2)} m`
}
