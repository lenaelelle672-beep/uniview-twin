import { beforeEach, describe, expect, it } from 'vitest'
import { buildFocusDetail } from '../../alarms/focusDetail'
import { createMockData } from '../../data/mockData'
import { floorSpec } from '../../data/floors'
import { clearFloorCache } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { SLAB_M } from '../stage/cut'
import { workstationPosition } from '../stage/workstationPosition'
import {
  FOCUS_FLOAT_LOCAL_Y,
  anchorInsideStorey,
  focusFloatDeskId,
  focusFloatLift,
  focusFloatLines,
  focusFloatWorld,
  resolveFocusFloatAnchor,
} from './anchor'

describe('聚焦浮动卡锚点', () => {
  beforeEach(() => {
    clearFloorCache()
  })

  it('没有聚焦时不给锚点', () => {
    const data = createMockData()
    expect(resolveFocusFloatAnchor(data.devices, { deskId: null, deviceId: null })).toBeNull()
    expect(focusFloatDeskId(data.devices, { deskId: null, deviceId: null })).toBeNull()
  })

  it('地上层图纸未就绪时不抛错，只返回空', () => {
    const data = createMockData()
    expect(resolveFocusFloatAnchor(data.devices, { deskId: 'F12-66', deviceId: null })).toBeNull()
  })

  it('工位锚在楼板之上，并且只跟图纸落点走', () => {
    hydrateFloorFromDisk('F12')
    const data = createMockData()
    const anchor = resolveFocusFloatAnchor(data.devices, { deskId: 'F12-66', deviceId: 'F12-66-PC' })
    const place = workstationPosition('F12', 'F12-66')
    expect(anchor).toMatchObject({
      floorId: 'F12',
      deskId: 'F12-66',
      x: place.x,
      z: place.z,
      y: place.y + SLAB_M + FOCUS_FLOAT_LOCAL_Y,
    })
    expect(anchor && anchorInsideStorey(anchor)).toBe(true)
    expect(anchor?.y).toBeGreaterThan(floorSpec('F12').elevation)
  })

  it('没有工位的设备不造锚点', () => {
    const data = createMockData()
    const camera = data.devices.find((device) => device.status === 'alarm' && !device.deskId)
    expect(camera).toBeTruthy()
    expect(resolveFocusFloatAnchor(data.devices, { deskId: null, deviceId: camera!.id })).toBeNull()
  })

  it('设备和工位冲突时锚点留在当前工位', () => {
    hydrateFloorFromDisk('F10')
    const data = createMockData()
    const other = data.devices.find((device) => device.deskId && device.deskId !== 'F10-11')
    expect(other?.deskId).toBeTruthy()
    const anchor = resolveFocusFloatAnchor(data.devices, { deskId: 'F10-11', deviceId: other!.id })
    expect(anchor?.deskId).toBe('F10-11')
    expect(focusFloatDeskId(data.devices, { deskId: 'F10-11', deviceId: other!.id })).toBe('F10-11')
  })

  it('摘要行来自 buildFocusDetail，一次最多四行', () => {
    const data = createMockData()
    const target = { deskId: 'F12-66', deviceId: 'F12-66-PC' }
    const detail = buildFocusDetail(data, target)
    expect(detail?.desk && detail.device).toBeTruthy()
    const lines = focusFloatLines(detail!)
    expect(lines.map((line) => line.role)).toEqual(['desk', 'person', 'device', 'status'])
    expect(lines[0]?.text).toContain(detail!.desk!.id)
    expect(lines[2]?.text).toContain(detail!.device!.id)
    expect(lines[3]?.text).toBe(detail!.device!.statusLabel)
    expect(lines.length).toBeLessThanOrEqual(4)
  })

  it('爆炸偏移只加在高度上', () => {
    const anchor = {
      floorId: 'F12',
      deskId: 'F12-66',
      x: 1,
      y: 40,
      z: 2,
    }
    expect(focusFloatLift('F12')).toBe(0)
    expect(focusFloatLift('F12', [{ id: 'F11', offset: 3 }])).toBe(0)
    expect(focusFloatLift('F12', [{ id: 'F12', offset: 8 }])).toBe(8)
    expect(focusFloatWorld(anchor, 8)).toEqual({ x: 1, y: 48, z: 2 })
  })
})
