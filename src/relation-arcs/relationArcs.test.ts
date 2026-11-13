import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RELATION_ARC_SOURCE_BLOCK, stripRelationArcSource } from '../../scripts/relationArcPlugin'
import { createMockData } from '../data/mockData'
import { composeOverlay } from '../grid/mount'
import { STATUS_GLYPH } from '../scene/stage/badges'
import {
  ALARM_GLYPH,
  RELATION_ALARM_Y,
  RELATION_ARC_CAP,
  RELATION_ARC_SEPARATE,
  RELATION_BOW,
  RELATION_DEVICE_Y,
  RELATION_LINE_WIDTH,
  RELATION_SEGMENTS,
  buildRelationArcs,
  deskDevices,
  pairRelations,
  readRelationBasis,
  relationArcOnAtBoot,
  relationArcSearchOfUrl,
  relationArcState,
  relationArcVisible,
  relationArcWanted,
  relationBasisKey,
  sameRelationBasis,
  transformPoint,
  type RelationAlarm,
  type RelationBasis,
  type RelationDevice,
  type RestSample,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
const LIFTED = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 10, 0, 1])

function device(id: string, status: string, type = 'pc', floorId = 'F12'): RelationDevice {
  const deskId = type === 'pc' ? id.replace(/-PC$/, '') : null
  return { id, floorId, deskId, type, status }
}

function alarm(deviceId: string, floorId = 'F12'): RelationAlarm {
  return { id: `${deviceId}-AL`, deviceId, floorId }
}

function restsFor(devices: readonly RelationDevice[], floorId = 'F12'): RestSample[] {
  return deskDevices(floorId, devices).map((desk, index) => ({
    x: index + 1,
    z: index + 2,
    status: desk.status === 'alarm' ? ALARM_GLYPH : 0,
  }))
}

describe('关系弧门闩', () => {
  const open = {
    view: 'floor',
    floorId: 'F12',
    switchOn: true,
    exploded: false,
    explodeProgress: 0,
    stationActive: false,
    stationAnimating: false,
    stationProgress: 0,
  }

  it('默认关，只在单层休息姿态、并且开关打开时画', () => {
    expect(relationArcState(open)).toBe('on')
    expect(relationArcVisible(open)).toBe(true)
    expect(relationArcState({ ...open, switchOn: false })).toBe('off-switch')
    expect(relationArcState({ ...open, view: 'building' })).toBe('off-view')
    expect(relationArcState({ ...open, view: 'blueprint' })).toBe('off-view')
    expect(relationArcState({ ...open, floorId: null })).toBe('off-view')
    expect(relationArcState({ ...open, exploded: true })).toBe('off-explode')
    expect(relationArcState({ ...open, explodeProgress: 0.2 })).toBe('off-explode')
    expect(relationArcState({ ...open, stationActive: true })).toBe('off-station')
    expect(relationArcState({ ...open, stationAnimating: true })).toBe('off-station')
    expect(relationArcState({ ...open, stationProgress: 0.4 })).toBe('off-station')
    expect(relationArcState({ ...open, switchOn: false, exploded: true })).toBe('off-switch')
    expect(relationArcVisible({ ...open, view: 'building' })).toBe(false)
  })

  it('?relationArc=1 才打开，启动地址里的也算', () => {
    expect(relationArcWanted('')).toBe(false)
    expect(relationArcWanted('?q=balanced')).toBe(false)
    expect(relationArcWanted('?relationArc=0')).toBe(false)
    expect(relationArcWanted('?relationArc=1')).toBe(true)
    expect(relationArcWanted('relationArc=1&view=floor')).toBe(true)
    expect(relationArcSearchOfUrl('http://127.0.0.1:5190/?view=floor&floor=F12&relationArc=1#x')).toBe(
      '?view=floor&floor=F12&relationArc=1',
    )
    expect(relationArcOnAtBoot('', 'http://127.0.0.1:5190/?q=balanced&view=floor&floor=F12&relationArc=1')).toBe(true)
    expect(relationArcOnAtBoot('?q=balanced', 'http://127.0.0.1:5190/?q=balanced')).toBe(false)
  })
})

describe('设备与告警配对', () => {
  it('只连有告警记录的电脑，二次和三次交替，并且有硬顶', () => {
    expect(ALARM_GLYPH).toBe(STATUS_GLYPH.alarm.index)
    expect(RELATION_ARC_CAP).toBe(4)
    expect(RELATION_LINE_WIDTH).toBeLessThanOrEqual(2)
    expect(RELATION_LINE_WIDTH).toBeGreaterThan(0)
    expect(RELATION_SEGMENTS).toBeGreaterThanOrEqual(8)
    expect(RELATION_SEGMENTS).toBeLessThanOrEqual(16)
    expect(RELATION_BOW).toBeGreaterThan(0.2)
    expect(RELATION_BOW).toBeLessThan(1)
    const devices = [
      device('F12-10-PC', 'alarm'),
      device('F12-2-PC', 'alarm'),
      device('F12-3-PC', 'online'),
      device('F12-4-PC', 'alarm'),
      device('F12-5-PC', 'alarm'),
      device('F12-6-PC', 'alarm'),
      device('F12-CAM1', 'alarm', 'camera'),
      device('F12-7-PC', 'alarm'),
    ]
    const alarms = [
      alarm('F12-10-PC'),
      alarm('F12-2-PC'),
      alarm('F12-4-PC'),
      alarm('F12-5-PC'),
      alarm('F12-6-PC'),
      alarm('F12-CAM1'),
      alarm('F12-7-PC'),
    ]
    const desks = deskDevices('F12', devices)
    expect(desks.map((item) => item.deskId)).toEqual(['F12-2', 'F12-3', 'F12-4', 'F12-5', 'F12-6', 'F12-7', 'F12-10'])
    const pairs = pairRelations('F12', devices, alarms, restsFor(devices))
    expect(pairs).toHaveLength(RELATION_ARC_CAP)
    expect(pairs.map((pair) => pair.kind)).toEqual(['quadratic', 'cubic', 'quadratic', 'cubic'])
    expect(pairs.map((pair) => pair.deviceId)).toEqual(['F12-2-PC', 'F12-4-PC', 'F12-5-PC', 'F12-6-PC'])
    expect(pairs.every((pair) => pair.deviceId !== 'F12-CAM1')).toBe(true)
    expect(pairs.every((pair) => pair.deviceId !== 'F12-3-PC')).toBe(true)
    expect(pairRelations('F12', devices, alarms, restsFor(devices).slice(0, 2))).toEqual([])
    expect(pairRelations('F12', devices, [], restsFor(devices))).toEqual([])
  })

  it('模拟数据里 F12 的告警电脑够两条曲线类型', () => {
    const data = createMockData()
    const alarmIds = new Set(data.alarms.filter((item) => item.floorId === 'F12').map((item) => item.deviceId))
    const linked = data.devices.filter(
      (item) => item.floorId === 'F12' && item.type === 'pc' && item.status === 'alarm' && item.deskId && alarmIds.has(item.id),
    )
    expect(linked.length).toBeGreaterThanOrEqual(RELATION_ARC_CAP)
  })
})

describe('控制点只生成一次', () => {
  const devices = [device('F12-1-PC', 'alarm'), device('F12-2-PC', 'alarm')]
  const alarms = [alarm('F12-1-PC'), alarm('F12-2-PC')]
  const rests = restsFor(devices)

  function basis(elements: readonly number[]): RelationBasis {
    const pairs = pairRelations('F12', devices, alarms, rests).map((pair) => Object.freeze({ ...pair }))
    return { floorId: 'F12', elements, pairs: Object.freeze(pairs) }
  }

  it('拱起离开直线，世界高度跟着楼层矩阵，点列冻住且不被下一次调用改掉', () => {
    const lifted = buildRelationArcs(basis(LIFTED))
    expect(lifted.map((arc) => arc.kind)).toEqual(['quadratic', 'cubic'])
    const quadratic = lifted[0]
    const cubic = lifted[1]
    if (!quadratic || quadratic.kind !== 'quadratic' || !cubic || cubic.kind !== 'cubic') throw new Error('弧类型不对')
    expect(quadratic.start[1]).toBeCloseTo(10 + RELATION_DEVICE_Y, 5)
    expect(quadratic.end[1]).toBeCloseTo(10 + RELATION_ALARM_Y, 5)
    expect(quadratic.mid[0] - quadratic.start[0]).toBeCloseTo(RELATION_BOW, 5)
    expect(Math.abs(quadratic.mid[0] - quadratic.start[0])).toBeGreaterThan(0.3)
    expect(cubic.midA[0]).not.toBeCloseTo(cubic.start[0], 2)
    expect(cubic.midB[1]).toBeGreaterThan(cubic.start[1])
    expect(cubic.midB[1]).toBeLessThan(cubic.end[1])
    const snapshot = JSON.stringify(lifted)
    buildRelationArcs(basis(LIFTED))
    expect(JSON.stringify(lifted)).toBe(snapshot)
    expect(Object.isFrozen(quadratic.start)).toBe(true)
    expect(Object.isFrozen(lifted)).toBe(true)
    expect(buildRelationArcs(null)).toBe(buildRelationArcs({ floorId: 'F12', elements: IDENTITY, pairs: [] }))
  })

  it('亚毫米矩阵抖动沿用同一份快照', () => {
    const first = basis(LIFTED)
    const noisy = basis(LIFTED.map((value, index) => (index === 13 ? value + 0.0001 : value)))
    expect(sameRelationBasis(first, noisy)).toBe(true)
    expect(relationBasisKey(first)).toBe(relationBasisKey(noisy))
    const moved = basis(LIFTED.map((value, index) => (index === 13 ? value + 0.2 : value)))
    expect(sameRelationBasis(first, moved)).toBe(false)
    expect(sameRelationBasis(first, null)).toBe(false)
    expect(transformPoint(IDENTITY, 1, 2, 3)).toEqual([1, 2, 3])
  })

  it('从圆标网格抄一份快照，层号对不上就不画', () => {
    const elements = LIFTED
    const scene = {
      getObjectByName(name: string) {
        if (name !== 'DeviceBadges') return undefined
        return {
          userData: {
            badgeFloorId: 'F12',
            badgeRests: rests.map((rest) => ({ x: rest.x, y: RELATION_ALARM_Y, z: rest.z })),
          },
          matrixWorld: { elements },
          updateWorldMatrix() {},
          geometry: {
            getAttribute(attribute: string) {
              if (attribute !== 'aStatus') return undefined
              return { getX: (index: number) => rests[index]?.status ?? 0, count: rests.length }
            },
          },
        }
      },
    }
    const read = readRelationBasis(scene, 'F12', devices, alarms)
    expect(read?.pairs).toHaveLength(2)
    expect(read?.elements[13]).toBe(10)
    expect(readRelationBasis(scene, 'F3', devices, alarms)).toBeNull()
    expect(readRelationBasis({ getObjectByName: () => undefined }, 'F12', devices, alarms)).toBeNull()
    const arcs = buildRelationArcs(read)
    expect(arcs[0]?.kind).toBe('quadratic')
    expect(arcs[1]?.kind).toBe('cubic')
  })
})

describe('关系弧接线', () => {
  it('两条贝塞尔懒挂在 dock 哈希之后，经 Line，不进首屏，也不取代别的线', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./RelationArcs.tsx')
    const plan = read('./plan.ts')
    const probe = read('./probe.ts')
    const plugin = read('../../scripts/relationArcPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const cubic = read('../../node_modules/@react-three/drei/core/CubicBezierLine.js')
    const quadratic = read('../../node_modules/@react-three/drei/core/QuadraticBezierLine.js')
    const line = read('../../node_modules/@react-three/drei/core/Line.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const lock = read('../../package-lock.json')

    expect(dock).toContain(RELATION_ARC_SOURCE_BLOCK)
    expect(dock).toMatch(/mod\.mountRoundedBox\(\)\n\}\)\n\n\/\/ T125：/)
    expect(stripRelationArcSource(dock)).not.toMatch(/relation-arcs|mountRelationArcs/)
    expect(stripRelationArcSource(dock)).toMatch(/mod\.mountRoundedBox\(\)\n\}\)\n\n\/\/ T127：室内盒投影环境/)
    expect(() => stripRelationArcSource('const dock = 1')).toThrow()
    expect(plugin).toContain(RELATION_ARC_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'relation-arc-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/RelationArcMount\.js/)
    expect(plugin).toMatch(/assets\/RelationArcs\.js/)
    expect(plugin).toMatch(/assets\/CubicBezierLine\.js/)
    expect(plugin).toMatch(/assets\/QuadraticBezierLine\.js/)
    expect(plugin).toMatch(/assets\/Line\.js/)

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('relationArcAfterHash()')).toBeGreaterThan(plugins.indexOf('roundedBoxAfterHash()'))
    expect(plugins.indexOf('relationArcAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinRelationArcNode/)
    expect(grid).toMatch(/__twinRoundedBoxNode/)
    expect(composeOverlay.length).toBe(3)
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'relations'),
    ).toBe('relations')
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'rounded'),
    ).toBe('rounded')

    expect(mount).toMatch(/import\('\.\/RelationArcs'\)/)
    expect(mount).not.toMatch(/import \{ RelationArcs \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|useFrame|https?:|setFrameloop|invalidate\(/)
    expect(mount).toMatch(/__twinRelationArcNode/)
    expect(mount).toMatch(/relationArcOnAtBoot/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|useFrame|CatmullRom|WalkPaths|MeasureTool|RoomLabels|BatchSegments/)
    expect(plan).toMatch(/a\.deskId\.localeCompare\(b\.deskId, 'en', \{ numeric: true \}\)/)
    expect(read('../scene/stage/badges.ts')).toMatch(
      /badges\.sort\(\(a, b\) => a\.deskId\.localeCompare\(b\.deskId, 'en', \{ numeric: true \}\)\)/,
    )
    expect(probe).toMatch(/useFrame: false/)
    expect(probe).toMatch(/mutatesPoints: false/)
    expect(probe).toMatch(/replacesTourPath: false/)
    expect(probe).toMatch(/replacesBatchSegments: false/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)
    expect(RELATION_ARC_SEPARATE).toEqual({
      tourPath: 'separate',
      measure: 'separate',
      walkPaths: 'separate',
      roomLabels: 'separate',
      batchSegments: 'separate',
    })

    expect(cubic).toMatch(/from '\.\/Line\.js'/)
    expect(cubic).toMatch(/React\.useMemo/)
    expect(cubic).toMatch(/CubicBezierCurve3/)
    expect(quadratic).toMatch(/from '\.\/Line\.js'/)
    expect(quadratic).toMatch(/React\.useMemo/)
    expect(quadratic).toMatch(/QuadraticBezierCurve3/)
    expect(line).not.toMatch(/useFrame/)
    const cubicGz = gzipSync(Buffer.from(cubic), { level: 9 }).length
    expect(cubicGz).toBeGreaterThan(39)
    expect(cubicGz).toBeLessThan(2_000)

    expect(live).toMatch(/from '@react-three\/drei\/core\/CubicBezierLine'/)
    expect(live).toMatch(/from '@react-three\/drei\/core\/QuadraticBezierLine'/)
    expect(live).toMatch(/<QuadraticBezierLine/)
    expect(live).toMatch(/<CubicBezierLine/)
    expect(live).toMatch(/useMemo\(\(\) => buildRelationArcs\(basis\), \[basis\]\)/)
    expect(live).toMatch(/name="DeviceAlarmRelations"/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/from 'three'|useFrame|setPositions|setPoints|CatmullRom|WalkPaths|MeasureTool|RoomLabels|BatchSegments|transmission/)
    expect(live).not.toMatch(/https?:|githack|jsdelivr|unpkg|setFrameloop|FogExp2/)

    const untouched = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../scene/stage/WalkPaths.tsx',
      '../scene/stage/RoomLabels.tsx',
      '../scene/stage/DeviceBadges.tsx',
      '../tour-path/TourPathLine.tsx',
      '../measure/MeasureTool.tsx',
      '../segments/BatchSegments.tsx',
      '../scene/explode.ts',
      '../scene/softShadows.ts',
      '../scene/fog.ts',
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/relation-arcs|mountRelationArcs|CubicBezierLine|QuadraticBezierLine|DeviceAlarmRelations/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.postprocessing).toBe('6.39.5')
    expect(pkg.dependencies['three-stdlib']).toBeUndefined()
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
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
    ])
    expect(lock).toMatch(/"node_modules\/@react-three\/drei"/)
    expect(lock).toMatch(/"version": "10\.7\.9"/)
    expect(lock).toMatch(/"node_modules\/three"/)
    expect(lock).toMatch(/"version": "0\.186\.1"/)
    expect(lock).toMatch(/"node_modules\/@react-three\/fiber"/)
    expect(lock).toMatch(/"version": "9\.8\.1"/)
    expect(lock).toMatch(/"node_modules\/@react-three\/postprocessing"/)
    expect(lock).toMatch(/"version": "3\.1\.3"/)
    expect(lock).toMatch(/"node_modules\/postprocessing"/)
    expect(lock).toMatch(/"version": "6\.39\.5"/)
  })
})
