import type { Desk, Device, DeviceStatus, Person, TwinData, Zone } from '../types'
import { listFloorSpecs } from './floors'
import { mulberry32 } from './random'
import { attachFloorCounts } from './counts'

export const MOCK_SEED = 20260928
export const DESKS_PER_FLOOR = 100

const STATUSES: DeviceStatus[] = ['online', 'idle', 'alarm', 'offline']
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

function nextStatus(rng: () => number, indexOnFloor: number): DeviceStatus {
  if (indexOnFloor < STATUSES.length) return STATUSES[indexOnFloor]
  return STATUSES[Math.floor(rng() * STATUSES.length)]
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
    const floorDevices: Device[] = []
    const pushDevice = (device: Omit<Device, 'status'> & { status?: DeviceStatus }) => {
      const status = nextStatus(statusRng, floorDevices.length)
      const next: Device = { ...device, status }
      floorDevices.push(next)
      devices.push(next)
      if (status === 'alarm') {
        alarms.push({
          id: `${next.id}-AL`,
          deviceId: next.id,
          floorId: spec.id,
          message: `${next.id} 告警`,
        })
      }
    }

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
      pushDevice({ id: `${id}-PC`, floorId: spec.id, deskId: id, type: 'pc', zone })
      pushDevice({ id: `${id}-PH`, floorId: spec.id, deskId: id, type: 'phone', zone })
    }

    for (let printer = 1; printer <= 2; printer += 1) {
      pushDevice({
        id: `${spec.id}-PR${printer}`,
        floorId: spec.id,
        type: 'printer',
        zone: zoneFor(spec.id, printer),
      })
    }

    const cameraCount = 4 + Math.floor(statusRng() * 3)
    for (let camera = 1; camera <= cameraCount; camera += 1) {
      pushDevice({
        id: `${spec.id}-CAM${camera}`,
        floorId: spec.id,
        type: 'camera',
        zone: zoneFor(spec.id, camera),
      })
    }
  }

  return attachFloorCounts({ floors, desks, devices, people, alarms })
}
