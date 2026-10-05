/** 每层工位数，从 Fxx.json 抽出。主包只带这 23 个整数，不带图纸。 */
export const FLOOR_DESK_COUNTS: Record<string, number> = {
  B1: 100,
  F1: 17,
  F2: 3,
  F3: 3,
  F4: 278,
  F5: 260,
  F6: 300,
  F7: 315,
  F8: 207,
  F9: 160,
  F10: 160,
  F11: 160,
  F12: 184,
  F13: 160,
  F14: 164,
  F15: 160,
  F16: 176,
  F17: 192,
  F18: 129,
  F19: 180,
  F20: 178,
  F21: 156,
  F22: 160,
}

export function floorDeskCount(floorId: string): number {
  const count = FLOOR_DESK_COUNTS[floorId]
  if (count == null) throw new Error(`未知楼层：${floorId}`)
  return count
}

export function floorJsonFile(floorId: string): string {
  if (floorId === 'B1') throw new Error('B1 不读地上层图纸')
  const level = Number(floorId.slice(1))
  if (!Number.isInteger(level) || level < 1 || level > 22) {
    throw new Error(`未知楼层：${floorId}`)
  }
  return `F${String(level).padStart(2, '0')}.json`
}
