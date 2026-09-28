import type { Desk, Device, DeviceStatus, Person, TwinData, Zone } from '../types'
import { listFloorSpecs } from './floors'
import { mulberry32 } from './random'
import { attachFloorCounts } from './counts'

export const MOCK_SEED = 20260928
export const DESKS_PER_FLOOR = 100
export const ALARM_HEAVY_FLOORS = ['F3', 'F12', 'F18'] as const

const IDLE_RATIO = 0.15
const ALARM_RATIO = 0.04
const OFFLINE_RATIO = 0.06
const SURNAMES = ['张', '王', '李', '赵', '陈', '刘', '杨', '黄', '周', '吴']
const GIVEN = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '杰', '婷', '浩']

function zoneFor(floorId: string, index: number): Zone {
  if (floorId === 'B1') return 'podium'
  const level = Number(floorId.slice(1))
  if (level >= 6) return 'tower'
  if (index > 90) return 'east'
  if (index > 70) return 'podium'
  return 'tower'
}

function deskPosition(index: number): { x: number; z: number } {
  const col = (index - 1) % 10
  const row = Math.floor((index - 1) / 10)
  return {
    x: -12 + col * (24 / 9),
    z: -30 + row * (60 / 9),
  }
}

function jitterAround(base: number, rng: () => number): number {
  const factor = 1 + (rng() * 2 - 1) * 0.4
  return Math.max(1, Math.round(base * factor))
}

function statusQuota(count: number, alarmHeavy: boolean, rng: () => number): DeviceStatus[] {
  const nominalAlarm = Math.round(count * ALARM_RATIO)
  const alarmBase = alarmHeavy ? nominalAlarm * 2 : nominalAlarm
  let alarm = jitterAround(alarmBase, rng)
  if (alarmHeavy) {
    const normalCeiling = Math.round(nominalAlarm * 1.4)
    alarm = Math.max(alarm, normalCeiling + 4)
  }
  const offline = jitterAround(Math.round(count * OFFLINE_RATIO), rng)
  const idle = Math.round(count * IDLE_RATIO)
  const online = count - alarm - idle - offline
  if (online < 1) {
    throw new Error(`在线设备不足：${online}/${count}`)
  }
  return [
    ...Array.from({ length: online }, () => 'online' as const),
    ...Array.from({ length: idle }, () => 'idle' as const),
    ...Array.from({ length: alarm }, () => 'alarm' as const),
    ...Array.from({ length: offline }, () => 'offline' as const),
  ]
}

function shuffleInPlace<T>(items: T[], rng: () => number) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const current = items[index]
    items[index] = items[swapIndex]
    items[swapIndex] = current
  }
}

function personName(rng: () => number, index: number): string {
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)]
  const given = GIVEN[Math.floor(rng() * GIVEN.length)]
  return `${surname}${given}${index}`
}

export function createMockData(seed = MOCK_SEED): TwinData {
  const statusRng = mulberry32(seed)
  const nameRng = mulberry32(seed ^ 0x9e3779b9)
  const desks: Desk[] = []
  const devices: Device[] = []
  const people: Person[] = []
  const alarms: TwinData['alarms'] = []
  const floors = listFloorSpecs().map((spec) => ({
    ...spec,
    alarmCount: 0,
    offlineCount: 0,
  }))

  for (const spec of floors) {
    const pending: Array<Omit<Device, 'status'>> = []
    const alarmHeavy = (ALARM_HEAVY_FLOORS as readonly string[]).includes(spec.id)

    for (let index = 1; index <= DESKS_PER_FLOOR; index += 1) {
      const id = `${spec.id}-${index}`
      const zone = zoneFor(spec.id, index)
      const { x, z } = deskPosition(index)
      desks.push({ id, floorId: spec.id, index, zone, x, y: spec.elevation, z })
      people.push({
        id: `${id}-P`,
        deskId: id,
        floorId: spec.id,
        name: personName(nameRng, index),
      })
      pending.push({ id: `${id}-PC`, floorId: spec.id, deskId: id, type: 'pc', zone })
      pending.push({ id: `${id}-PH`, floorId: spec.id, deskId: id, type: 'phone', zone })
    }

    for (let printer = 1; printer <= 2; printer += 1) {
      pending.push({
        id: `${spec.id}-PR${printer}`,
        floorId: spec.id,
        type: 'printer',
        zone: zoneFor(spec.id, printer),
      })
    }

    const cameraCount = 4 + Math.floor(statusRng() * 3)
    for (let camera = 1; camera <= cameraCount; camera += 1) {
      pending.push({
        id: `${spec.id}-CAM${camera}`,
        floorId: spec.id,
        type: 'camera',
        zone: zoneFor(spec.id, camera),
      })
    }

    const statuses = statusQuota(pending.length, alarmHeavy, statusRng)
    shuffleInPlace(statuses, statusRng)
    pending.forEach((device, index) => {
      const status = statuses[index]
      const next: Device = { ...device, status }
      devices.push(next)
      if (status === 'alarm') {
        alarms.push({
          id: `${next.id}-AL`,
          deviceId: next.id,
          floorId: spec.id,
          message: `${next.id} 告警`,
        })
      }
    })
  }

  return attachFloorCounts({ floors, desks, devices, people, alarms })
}
