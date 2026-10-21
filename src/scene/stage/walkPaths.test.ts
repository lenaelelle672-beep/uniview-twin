import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { AdditiveBlending, Color, NormalBlending } from 'three'
import { clearFloorCache, getFloorPlan } from '../../floors/cache'
import { hydrateFloorFromDisk } from '../../floors/hydrateForTests'
import type { Alarm, Device } from '../../types'
import { ZONE_HEAT_LIFT, ZONE_HEAT_OPACITY, ZONE_HEAT_ORDER, heatColorForCount } from './zoneHeat'
import {
  WALK_OCCUPANCY_RADIUS_M,
  WALK_PATH_BLENDING,
  WALK_PATH_DASHED,
  WALK_PATH_LIFT,
  WALK_PATH_OPACITY,
  WALK_PATH_ORDER,
  WALK_PATH_POLYGON_OFFSET,
  countAlarmsNear,
  emptyWalkSamples,
  paintWalkOccupancy,
  readPlanPaths,
  resetWalkPathPref,
  retainWalkColors,
  retainWalkPolylines,
  retainWalkSamples,
  selectWalkLayer,
  setWalkPathPref,
  subscribeWalkPathPref,
  walkOccupancyColor,
  walkPathPref,
} from './walkPaths'

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

describe('走廊人流路径', () => {
  afterEach(() => {
    resetWalkPathPref()
  })

  it('贴地虚线低于热力铺色，顺序夹在热力和标签之间', () => {
    expect(WALK_PATH_OPACITY).toBeGreaterThan(0.2)
    expect(WALK_PATH_OPACITY).toBeLessThan(ZONE_HEAT_OPACITY)
    expect(WALK_PATH_LIFT).toBeGreaterThan(ZONE_HEAT_LIFT)
    expect(WALK_PATH_LIFT).toBeLessThan(0.5)
    expect(WALK_PATH_ORDER).toBeGreaterThan(ZONE_HEAT_ORDER)
    expect(WALK_PATH_ORDER).toBeLessThan(3)
    expect(WALK_PATH_POLYGON_OFFSET).toBeLessThan(-1)
    expect(WALK_PATH_DASHED).toBe(true)
    expect(WALK_PATH_BLENDING).toBe(NormalBlending)
    expect(WALK_PATH_BLENDING).not.toBe(AdditiveBlending)
  })

  it('同一条折线反复算，points 数组引用不变', () => {
    const seed = { key: '\0', floorId: '', paths: undefined, lines: [] as Array<Array<[number, number, number]>> }
    const paths = [
      [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 2 },
        { x: 0, z: 0 },
      ],
    ]
    const first = retainWalkPolylines('F12', paths, seed)
    const copy = paths.map((path) => path.map((point) => ({ x: point.x, z: point.z })))
    const second = retainWalkPolylines('F12', copy, first)
    expect(second).toBe(first)
    expect(second.lines[0]).toBe(first.lines[0])
    expect(second.lines[0]![0]![1]).toBe(0)
    expect(second.lines[0]).toHaveLength(4)
    const moved = retainWalkPolylines('F12', [[{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 0, z: 0 }]], first)
    expect(moved).not.toBe(first)
    expect(moved.lines[0]).not.toBe(first.lines[0])
  })

  it('告警色只读热力色，空密度不铺绿，引用在告警坐标不变时保持', () => {
    const lines = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [6, 0, 0],
      ] as Array<[number, number, number]>,
    ]
    const near = { x: 0.4, z: 0 }
    const far = { x: 20, z: 20 }
    expect(countAlarmsNear(0, 0, [near, far])).toBe(1)
    expect(countAlarmsNear(6, 0, [near, far])).toBe(0)
    expect(countAlarmsNear(0, 0, [near, { x: 0.2, z: 0.2 }])).toBe(2)
    const base = walkOccupancyColor(0)
    const green = new Color(heatColorForCount(0))
    expect(base[1]).not.toBeCloseTo(green.g)
    const yellow = new Color(heatColorForCount(1))
    const red = new Color(heatColorForCount(2))
    expect(Array.from(walkOccupancyColor(1))).toEqual([yellow.r, yellow.g, yellow.b])
    expect(Array.from(walkOccupancyColor(4))).toEqual([red.r, red.g, red.b])
    expect(walkOccupancyColor(1)).toBe(walkOccupancyColor(1))
    const painted = paintWalkOccupancy(lines, [near, far])
    const snapshot = lines[0]!.map((point) => point.slice())
    paintWalkOccupancy(lines, [near])
    expect(lines[0]).toEqual(snapshot)
    expect(painted[0]![0]).toEqual(Array.from(walkOccupancyColor(1)))
    expect(painted[0]![2]).toEqual(Array.from(walkOccupancyColor(0)))
    const cache = { key: '\0', samples: null, geometryKey: '', colors: null }
    const first = retainWalkColors(lines, [near, far], true, 'geo', cache)
    const again = retainWalkColors(lines, [{ ...near }, { ...far }], true, 'geo', first)
    expect(again).toBe(first)
    expect(again.colors).toBe(first.colors)
    const off = retainWalkColors(lines, [near], false, 'geo', first)
    expect(off.colors).toBeNull()
    const stillOff = retainWalkColors(lines, [], false, 'geo', off)
    expect(stillOff).toBe(off)
    expect(WALK_OCCUPANCY_RADIUS_M).toBeGreaterThan(0)
  })

  it('告警落点数组跟着楼层和告警引用走，不改热力函数', () => {
    const place = { id: 'F12-1-PC', floorId: 'F12', deskId: 'F12-1' }
    const devices = [device(place)]
    const alarms = [alarm({ id: 'a1', deviceId: place.id, floorId: 'F12' })]
    const first = retainWalkSamples('F12', alarms, devices, emptyWalkSamples())
    const second = retainWalkSamples('F12', alarms, devices, first)
    expect(second).toBe(first)
    expect(second.points.length).toBeLessThanOrEqual(1)
    const nextAlarms = [alarm({ id: 'a2', deviceId: place.id, floorId: 'F12' })]
    const third = retainWalkSamples('F12', nextAlarms, devices, first)
    expect(third).not.toBe(first)
    expect(read('zoneHeat.ts')).not.toMatch(/walkPath|WalkPaths/)
    expect(read('walkPaths.ts')).toMatch(/heatColorForCount/)
    expect(read('walkPaths.ts')).toMatch(/alarmPointsOnFloor/)
  })

  it('F12 的图纸路径原样收成贴地折线，重复读取不换引用', () => {
    hydrateFloorFromDisk('F12')
    const plan = getFloorPlan('F12')!
    expect(readPlanPaths('F12')).toBe(plan.walkPaths)
    const first = retainWalkPolylines('F12', readPlanPaths('F12'), {
      key: '\0',
      floorId: '',
      paths: undefined,
      lines: [],
    })
    const second = retainWalkPolylines('F12', readPlanPaths('F12'), first)
    expect(second).toBe(first)
    expect(first.lines).toHaveLength(plan.walkPaths.length)
    for (let index = 0; index < plan.walkPaths.length; index += 1) {
      const line = first.lines[index]!
      const source = plan.walkPaths[index]!
      expect(line).toHaveLength(source.length)
      expect(line[0]![0]).toBeCloseTo(source[0]![0])
      expect(line[0]![2]).toBeCloseTo(source[0]![1])
      expect(line.every((point) => point[1] === 0)).toBe(true)
    }
    clearFloorCache('B1')
    const missing = readPlanPaths('B1')
    expect(missing).toEqual([])
    expect(readPlanPaths('B1')).toBe(missing)
  })

  it('自带开关默认开；没有 layers.walkPaths 时不接管', () => {
    expect(walkPathPref()).toEqual({ visible: true, occupancy: true })
    let calls = 0
    const unsubscribe = subscribeWalkPathPref(() => {
      calls += 1
    })
    setWalkPathPref({ occupancy: false })
    expect(walkPathPref().occupancy).toBe(false)
    expect(calls).toBe(1)
    setWalkPathPref({ occupancy: false })
    expect(calls).toBe(1)
    unsubscribe()
    expect(selectWalkLayer({})).toBeNull()
    expect(selectWalkLayer({ layers: { people: true } })).toBeNull()
    expect(selectWalkLayer({ layers: { walkPaths: false } })).toBe(false)
    expect(selectWalkLayer({ layers: { walkPaths: true } })).toBe(true)
  })

  it('画在 floorDecor 懒包里，首屏和均衡后处理碰不到', () => {
    const decor = read('floorDecor.tsx')
    const view = read('WalkPaths.tsx')
    const logic = read('walkPaths.ts')
    const drei = readFileSync(join(here, '../../../node_modules/@react-three/drei/core/Line.js'), 'utf8')
    const scene = readFileSync(join(here, '../../components/Scene.tsx'), 'utf8')
    const stage = read('FloorStage.tsx')
    const order = readFileSync(join(here, '../overlayOrder.ts'), 'utf8')
    const fx = readFileSync(join(here, '../../components/scene/postfx/balancedFx.tsx'), 'utf8')
    const fog = readFileSync(join(here, '../fog.ts'), 'utf8')
    const pkg = readFileSync(join(here, '../../../package.json'), 'utf8')
    expect(decor).toMatch(/<WalkPaths floorId=\{floorId\} \/>/)
    expect(decor.match(/<WalkPaths /g)).toHaveLength(1)
    expect(view).toMatch(/from '@react-three\/drei\/core\/Line'/)
    expect(view).toMatch(/retainWalkPolylines/)
    expect(view).toMatch(/retainWalkColors/)
    expect(view).toMatch(/points=\{line\}/)
    expect(view).toMatch(/name="WalkPaths"/)
    expect(view).toMatch(/depthWrite=\{false\}/)
    expect(view).toMatch(/blending=\{WALK_PATH_BLENDING\}/)
    expect(view).toMatch(/dashed=\{WALK_PATH_DASHED\}/)
    expect(view).toMatch(/invalidate\(\)/)
    expect(view).toMatch(/delete window\.__twinWalkPaths/)
    expect(view).toMatch(/data-walk-paths|dataset\.walkPaths/)
    expect(view).toMatch(/bar\.remove\(\)/)
    expect(view).not.toMatch(/useFrame/)
    expect(view).not.toMatch(/CatmullRomLine/)
    expect(view).not.toMatch(/AdditiveBlending/)
    expect(drei).toMatch(/lineMaterial\.dispose\(\)/)
    expect(drei).toMatch(/\[points, segments, vertexColors, itemSize\]/)
    const banned = /softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx|FOG_DENSITY|FogExp2/
    expect(view).not.toMatch(banned)
    expect(logic).not.toMatch(banned)
    expect(scene).not.toMatch(/WalkPaths|walkPaths/)
    expect(stage).not.toMatch(/WalkPaths|walkPaths/)
    expect(order).not.toMatch(/WalkPaths|walkPaths/)
    expect(fx).not.toMatch(/WalkPaths|walkPaths/)
    expect(fog).not.toMatch(/WalkPaths|walkPaths/)
    const dependencies = Object.keys(JSON.parse(pkg).dependencies as Record<string, string>).sort()
    expect(dependencies).toEqual(
      [
        '@react-three/drei',
        '@react-three/fiber',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'three',
        'troika-three-text',
        'troika-three-utils',
        'troika-worker-utils',
        'zustand',
      ].sort(),
    )
  })
})
