import type { Alarm, Desk, Device, Floor, Person, TwinData } from '../types'
import { DEVICE_STATUSES, DEVICE_TYPES, ZONES } from '../types'
import { isFloorId } from './floors'
import { attachFloorCounts } from './counts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, detail: string): never {
  throw new Error(`数据格式不正确：${path} ${detail}`)
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, '必须是对象')
  return value
}

function expectArray(source: Record<string, unknown>, key: string): unknown[] {
  const value = source[key]
  if (!Array.isArray(value)) fail(key, '必须是数组')
  return value
}

function expectString(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${key}`, '必须是非空字符串')
  return value
}

function expectNumber(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${path}.${key}`, '必须是有限数字')
  return value
}

function expectEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(path, `必须是 ${allowed.join('、')} 之一`)
  }
  return value as T
}

function rememberId(ids: Set<string>, id: string, path: string) {
  if (ids.has(id)) fail(path, `编号重复：${id}`)
  ids.add(id)
}

export function validateTwinData(raw: unknown): TwinData {
  const root = expectRecord(raw, '根节点')
  const floorRows = expectArray(root, 'floors')
  const deskRows = expectArray(root, 'desks')
  const deviceRows = expectArray(root, 'devices')
  const peopleRows = expectArray(root, 'people')
  const alarmRows = expectArray(root, 'alarms')

  const floorIds = new Set<string>()
  const floors: Floor[] = floorRows.map((row, index) => {
    const path = `floors[${index}]`
    const record = expectRecord(row, path)
    const id = expectString(record, 'id', path)
    if (!isFloorId(id)) fail(`${path}.id`, '必须是 B1 或 F1～F22')
    rememberId(floorIds, id, path)
    return {
      id,
      name: expectString(record, 'name', path),
      level: expectNumber(record, 'level', path),
      elevation: expectNumber(record, 'elevation', path),
      height: expectNumber(record, 'height', path),
      alarmCount: 0,
      offlineCount: 0,
    }
  })

  const deskIds = new Set<string>()
  const desks: Desk[] = deskRows.map((row, index) => {
    const path = `desks[${index}]`
    const record = expectRecord(row, path)
    const id = expectString(record, 'id', path)
    const floorId = expectString(record, 'floorId', path)
    if (!floorIds.has(floorId)) fail(`${path}.floorId`, `引用了不存在的楼层 ${floorId}`)
    rememberId(deskIds, id, path)
    const indexNo = expectNumber(record, 'index', path)
    if (!Number.isInteger(indexNo) || indexNo < 1) fail(`${path}.index`, '必须是从 1 开始的整数')
    return {
      id,
      floorId,
      index: indexNo,
      zone: expectEnum(record.zone, ZONES, `${path}.zone`),
      x: expectNumber(record, 'x', path),
      y: expectNumber(record, 'y', path),
      z: expectNumber(record, 'z', path),
    }
  })

  const deviceIds = new Set<string>()
  const devices: Device[] = deviceRows.map((row, index) => {
    const path = `devices[${index}]`
    const record = expectRecord(row, path)
    const id = expectString(record, 'id', path)
    const floorId = expectString(record, 'floorId', path)
    if (!floorIds.has(floorId)) fail(`${path}.floorId`, `引用了不存在的楼层 ${floorId}`)
    rememberId(deviceIds, id, path)
    const device: Device = {
      id,
      floorId,
      type: expectEnum(record.type, DEVICE_TYPES, `${path}.type`),
      status: expectEnum(record.status, DEVICE_STATUSES, `${path}.status`),
      zone: expectEnum(record.zone, ZONES, `${path}.zone`),
    }
    if (record.deskId !== undefined) {
      const deskId = expectString(record, 'deskId', path)
      if (!deskIds.has(deskId)) fail(`${path}.deskId`, `引用了不存在的工位 ${deskId}`)
      device.deskId = deskId
    }
    return device
  })

  const people: Person[] = peopleRows.map((row, index) => {
    const path = `people[${index}]`
    const record = expectRecord(row, path)
    const floorId = expectString(record, 'floorId', path)
    const deskId = expectString(record, 'deskId', path)
    if (!floorIds.has(floorId)) fail(`${path}.floorId`, `引用了不存在的楼层 ${floorId}`)
    if (!deskIds.has(deskId)) fail(`${path}.deskId`, `引用了不存在的工位 ${deskId}`)
    return {
      id: expectString(record, 'id', path),
      deskId,
      floorId,
      name: expectString(record, 'name', path),
    }
  })

  const alarms: Alarm[] = alarmRows.map((row, index) => {
    const path = `alarms[${index}]`
    const record = expectRecord(row, path)
    const floorId = expectString(record, 'floorId', path)
    const deviceId = expectString(record, 'deviceId', path)
    if (!floorIds.has(floorId)) fail(`${path}.floorId`, `引用了不存在的楼层 ${floorId}`)
    if (!deviceIds.has(deviceId)) fail(`${path}.deviceId`, `引用了不存在的设备 ${deviceId}`)
    return {
      id: expectString(record, 'id', path),
      deviceId,
      floorId,
      message: expectString(record, 'message', path),
    }
  })

  return attachFloorCounts({ floors, desks, devices, people, alarms })
}
