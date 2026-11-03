import { beforeEach, describe, expect, it } from 'vitest'
import { Box3, Group, Mesh } from 'three'
import { buildFocusDetail } from '../../alarms/focusDetail'
import { createMockData } from '../../data/mockData'
import { floorSpec } from '../../data/floors'
import { clearFloorCache } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { SLAB_M } from '../stage/cut'
import { deskGeometry, monitorGeometry } from '../stage/geometry'
import { workstationPosition } from '../stage/workstationPosition'
import {
  FOCUS_FLOAT_BOUNDS,
  FOCUS_FLOAT_CORNER,
  FOCUS_FLOAT_LOCAL_Y,
  anchorInsideStorey,
  focusFloatCornerBox,
  focusFloatCornerLocal,
  focusFloatDeskId,
  focusFloatExplodeShift,
  focusFloatGroupPosition,
  focusFloatLift,
  focusFloatLines,
  focusFloatWorld,
  resolveFocusFloatAnchor,
  type FocusFloatAnchor,
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
      rot: place.rot,
      originY: place.y + SLAB_M,
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
    const anchor: FocusFloatAnchor = {
      floorId: 'F12',
      deskId: 'F12-66',
      x: 1,
      y: 40,
      z: 2,
      rot: 0,
      originY: 32,
    }
    expect(focusFloatLift('F12')).toBe(0)
    expect(focusFloatLift('F12', [{ id: 'F11', offset: 3 }])).toBe(0)
    expect(focusFloatLift('F12', [{ id: 'F12', offset: 8 }])).toBe(8)
    expect(focusFloatWorld(anchor, 8)).toEqual({ x: 1, y: 48, z: 2 })
  })

  it('包围盒是桌和显示器的并，顶角由 BBAnchor 公式落到最大角', () => {
    deskGeometry.computeBoundingBox()
    monitorGeometry.computeBoundingBox()
    const union = deskGeometry.boundingBox!.clone().union(monitorGeometry.boundingBox!)
    expect(FOCUS_FLOAT_BOUNDS.min[0]).toBeCloseTo(union.min.x, 5)
    expect(FOCUS_FLOAT_BOUNDS.min[1]).toBeCloseTo(union.min.y, 5)
    expect(FOCUS_FLOAT_BOUNDS.min[2]).toBeCloseTo(union.min.z, 5)
    expect(FOCUS_FLOAT_BOUNDS.max[0]).toBeCloseTo(union.max.x, 5)
    expect(FOCUS_FLOAT_BOUNDS.max[1]).toBeCloseTo(union.max.y, 5)
    expect(FOCUS_FLOAT_BOUNDS.max[2]).toBeCloseTo(union.max.z, 5)
    expect(FOCUS_FLOAT_CORNER).toEqual([1, 1, 1])

    for (const rot of [0, Math.PI / 2, 0.65]) {
      const group = new Group()
      const desk = new Mesh(deskGeometry)
      const monitor = new Mesh(monitorGeometry)
      desk.rotation.y = rot
      monitor.rotation.y = rot
      group.add(desk, monitor)
      group.updateMatrixWorld(true)
      const measured = new Box3().setFromObject(group)
      const corner = focusFloatCornerLocal(focusFloatCornerBox(rot))
      expect(corner[0]).toBeCloseTo(measured.max.x, 4)
      expect(corner[1]).toBeCloseTo(measured.max.y, 4)
      expect(corner[2]).toBeCloseTo(measured.max.z, 4)
    }
  })

  it('炸开抬锚读已有时钟，钩子未装时只加外壳偏移', () => {
    const anchor: FocusFloatAnchor = {
      floorId: 'F12',
      deskId: 'F12-66',
      x: 1,
      y: 40,
      z: 2,
      rot: 0,
      originY: 32,
    }
    const root = globalThis as { window?: Window }
    const previous = root.window
    root.window = {
      __twinExplode: {
        progress: 1,
        exploded: true,
        gap: 8,
        overlap: false,
        floors: [{ id: 'F12', offset: 8, groupY: null, bottom: 0, top: 1 }],
      },
    } as Window
    try {
      expect(focusFloatExplodeShift('F12', 1, 2)).toEqual({ x: 0, y: 8, z: 0 })
      expect(focusFloatGroupPosition(anchor, focusFloatExplodeShift('F12', 1, 2))).toEqual({ x: 1, y: 40, z: 2 })
      root.window.__twinBadgeExplodeDelta = () => ({ x: 1.6, y: 8, z: -0.4 })
      expect(focusFloatExplodeShift('F12', 1, 2)).toEqual({ x: 1.6, y: 8, z: -0.4 })
      expect(focusFloatGroupPosition(anchor, { x: 1.6, y: 8, z: -0.4 })).toEqual({ x: 2.6, y: 40, z: 1.6 })
    } finally {
      if (previous) root.window = previous
      else delete root.window
    }
  })
})
