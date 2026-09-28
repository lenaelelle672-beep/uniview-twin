import type { TwinData } from '../types'

export function attachFloorCounts(data: TwinData): TwinData {
  const floors = data.floors.map((floor) => {
    let alarmCount = 0
    let offlineCount = 0
    for (const device of data.devices) {
      if (device.floorId !== floor.id) continue
      if (device.status === 'alarm') alarmCount += 1
      if (device.status === 'offline') offlineCount += 1
    }
    return { ...floor, alarmCount, offlineCount }
  })
  return { ...data, floors }
}
