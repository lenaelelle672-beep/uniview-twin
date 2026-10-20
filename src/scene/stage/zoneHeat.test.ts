import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { hydrateAllAboveGrade, hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import { clearFloorCache } from '../../floors/cache'
import type { Alarm, Device } from '../../types'
import { B1_COLOR_BLOCK_COUNT } from '../b1Zones'
import { workstationPosition } from './workstationPosition'
import {
  ZONE_HEAT_COLOR,
  ZONE_HEAT_LIFT,
  ZONE_HEAT_OPACITY,
  ZONE_HEAT_ORDER,
  alarmPointsOnFloor,
  buildHeatGeometryFromRings,
  buildZoneHeatGeometry,
  countAlarmsPerZone,
  createZoneHeatMaterial,
  heatColorForCount,
  zoneAlarmCounts,
  zoneRingsForFloor,
} from './zoneHeat'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

function alarm(partial: Partial<Alarm> & Pick<Alarm, 'id' | 'deviceId' | 'floorId'>): Alarm {
  return { message: partial.id, ...partial }
}

function device(partial: Partial<Device> & Pick<Device, 'id' | 'floorId'>): Device {
  return { type: 'pc', status: 'alarm', zone: 'podium', ...partial }
}

const square = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
]

describe('区域告警热力', () => {
  it('告警数映射绿、黄、红', () => {
    expect(heatColorForCount(0)).toBe(ZONE_HEAT_COLOR.green)
    expect(heatColorForCount(-3)).toBe(ZONE_HEAT_COLOR.green)
    expect(heatColorForCount(1)).toBe(ZONE_HEAT_COLOR.yellow)
    expect(heatColorForCount(2)).toBe(ZONE_HEAT_COLOR.red)
    expect(heatColorForCount(9)).toBe(ZONE_HEAT_COLOR.red)
  })

  it('区内归最小环，区外归最近边', () => {
    const outer = square(0, 0, 10, 10)
    const inner = square(1, 1, 3, 3)
    const side = square(20, 0, 24, 4)
    const counts = countAlarmsPerZone(
      [outer, inner, side],
      [
        { x: 2, z: 2 },
        { x: 8, z: 8 },
        { x: 21, z: 1 },
        { x: 16, z: 2 },
      ],
    )
    expect(counts).toEqual([1, 1, 2])
  })

  it('只数本层有工位的告警', () => {
    const place = workstationPosition('B1', 'B1-8')
    const devices = [
      device({ id: 'B1-8-PC', floorId: 'B1', deskId: 'B1-8' }),
      device({ id: 'B1-PR', floorId: 'B1', type: 'printer' }),
      device({ id: 'F3-1-PC', floorId: 'F3', deskId: 'F3-1' }),
    ]
    const alarms = [
      alarm({ id: 'a1', deviceId: 'B1-8-PC', floorId: 'B1' }),
      alarm({ id: 'a2', deviceId: 'B1-PR', floorId: 'B1' }),
      alarm({ id: 'a3', deviceId: 'F3-1-PC', floorId: 'F3' }),
      alarm({ id: 'a4', deviceId: 'missing', floorId: 'B1' }),
    ]
    expect(alarmPointsOnFloor('B1', alarms, devices)).toEqual([{ x: place.x, z: place.z }])
    const counts = zoneAlarmCounts('B1', alarms, devices)
    expect(counts).toHaveLength(B1_COLOR_BLOCK_COUNT)
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
    const hot = counts.filter((count) => count > 0)
    expect(hot).toEqual([1])
  })

  it('B1 有区环；没有图纸的楼层不画', () => {
    expect(zoneRingsForFloor('B1')).toHaveLength(B1_COLOR_BLOCK_COUNT)
    clearFloorCache('F4')
    expect(zoneRingsForFloor('F4')).toEqual([])
    expect(buildZoneHeatGeometry('F4', [], [])).toBeNull()
  })

  it('有房间多边形的楼层收成一个顶点色网格', () => {
    hydrateFloorFromDisk('F12')
    const rings = zoneRingsForFloor('F12')
    expect(rings.length).toBeGreaterThan(0)
    const geometry = buildZoneHeatGeometry('F12', [], [])
    expect(geometry).toBeTruthy()
    const position = geometry!.getAttribute('position')
    const color = geometry!.getAttribute('color')
    expect(color.count).toBe(position.count)
    expect(geometry!.groups).toHaveLength(0)
    const green = new Color(ZONE_HEAT_COLOR.green)
    expect(color.getX(0)).toBeCloseTo(green.r)
    expect(color.getY(0)).toBeCloseTo(green.g)
    expect(color.getZ(0)).toBeCloseTo(green.b)
    let maxY = 0
    for (let index = 0; index < position.count; index += 1) maxY = Math.max(maxY, Math.abs(position.getY(index)))
    expect(maxY).toBeLessThan(1e-4)
    geometry!.dispose()
  })

  it('地上每一层要么没有环，要么能收成一个网格', () => {
    hydrateAllAboveGrade()
    for (let level = 1; level <= 22; level += 1) {
      const floorId = `F${level}`
      const rings = zoneRingsForFloor(floorId)
      const geometry = buildZoneHeatGeometry(floorId, [], [])
      if (rings.length === 0) {
        expect(geometry).toBeNull()
        continue
      }
      expect(geometry).toBeTruthy()
      expect(geometry!.groups).toHaveLength(0)
      expect(geometry!.getAttribute('color').count).toBe(geometry!.getAttribute('position').count)
      geometry!.dispose()
    }
  })

  it('三块不同告警数合成一个无分组网格，顶点色分开', () => {
    const geometry = buildHeatGeometryFromRings([square(0, 0, 2, 2), square(4, 0, 6, 2), square(8, 0, 10, 2)], [0, 1, 3])
    expect(geometry).toBeTruthy()
    expect(geometry!.groups).toHaveLength(0)
    const color = geometry!.getAttribute('color')
    const green = new Color(ZONE_HEAT_COLOR.green)
    const yellow = new Color(ZONE_HEAT_COLOR.yellow)
    const red = new Color(ZONE_HEAT_COLOR.red)
    const seen = new Set<string>()
    for (let index = 0; index < color.count; index += 1) {
      const key = `${color.getX(index).toFixed(5)},${color.getY(index).toFixed(5)},${color.getZ(index).toFixed(5)}`
      seen.add(key)
    }
    expect(seen).toEqual(
      new Set([
        `${green.r.toFixed(5)},${green.g.toFixed(5)},${green.b.toFixed(5)}`,
        `${yellow.r.toFixed(5)},${yellow.g.toFixed(5)},${yellow.b.toFixed(5)}`,
        `${red.r.toFixed(5)},${red.g.toFixed(5)},${red.b.toFixed(5)}`,
      ]),
    )
    geometry!.dispose()
  })

  it('材质半透明、不写深度、polygonOffset，仍吃雾', () => {
    const material = createZoneHeatMaterial()
    expect(material.transparent).toBe(true)
    expect(material.opacity).toBe(ZONE_HEAT_OPACITY)
    expect(material.depthWrite).toBe(false)
    expect(material.polygonOffset).toBe(true)
    expect(material.polygonOffsetFactor).toBeLessThan(0)
    expect(material.vertexColors).toBe(true)
    expect(material.fog).toBe(true)
    expect(ZONE_HEAT_LIFT).toBeGreaterThan(0.16)
    expect(ZONE_HEAT_ORDER).toBeGreaterThan(0)
    expect(ZONE_HEAT_ORDER).toBeLessThan(3)
    material.dispose()
  })

  it('热力在 lazy 分包，demand 要 invalidate，回总览随室内卸下', () => {
    const lazy = read('lazyZoneHeat.tsx')
    const mesh = read('ZoneHeatMesh.tsx')
    const stage = read('FloorStage.tsx')
    const scene = readFileSync(join(here, '../../components/Scene.tsx'), 'utf8')
    const order = readFileSync(join(here, '../overlayOrder.ts'), 'utf8')
    const interior = read('B1Interior.tsx')
    const jsonInterior = readFileSync(join(here, '../../floors/JsonFloorInterior.tsx'), 'utf8')
    expect(lazy).toMatch(/lazy\(/)
    expect(lazy).toMatch(/import\('\.\/ZoneHeatMesh'\)/)
    expect(mesh).toMatch(/invalidate\(\)/)
    expect(mesh).toMatch(/geometry\.dispose\(\)/)
    expect(mesh).toMatch(/material\.dispose\(\)/)
    expect(mesh).toMatch(/name="ZoneHeat"/)
    expect(mesh).toMatch(/dispose=\{null\}/)
    expect(mesh).toMatch(/ZONE_HEAT_ORDER/)
    expect(mesh).toMatch(/ZONE_HEAT_LIFT/)
    expect(interior).toMatch(/<ZoneHeat floorId="B1" \/>/)
    expect(jsonInterior).toMatch(/<ZoneHeat floorId=\{spec\.id\} \/>/)
    expect(stage).not.toMatch(/zoneHeat|ZoneHeat/)
    expect(scene).not.toMatch(/zoneHeat|ZoneHeat/)
    expect(order).not.toMatch(/ZoneHeat|zoneHeat/)
    const impl = `${read('zoneHeat.ts')}\n${mesh}\n${lazy}`
    expect(impl).not.toMatch(/DeskOutline|deskOutline|FloorCut|balancedFx|SoftShadows|cameraRest|frameSchedule|DemandLoop/)
  })
})
