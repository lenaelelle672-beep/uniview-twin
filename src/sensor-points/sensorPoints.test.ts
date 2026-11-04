import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { SENSOR_POINTS_SOURCE_BLOCK, stripSensorPointsSource, threeImportNames } from '../../scripts/sensorPointsPlugin'
import { listFloorSpecs } from '../data/floors'
import { composeOverlay } from '../grid/mount'
import { explodeOffset, EXPLODE_GAP_M, EXPLODE_GROUND_CLEARANCE_M } from '../scene/explode'
import { SOFT_SHADOW_CHUNK_AFTER_FIRST_MS } from '../scene/softShadows'
import { badgeAnchor } from '../scene/badges'
import { STATUS_GLYPH } from '../scene/stage/badges'
import { sensorAlarmFloorCount, sensorAlarmKey, writeSensorCloud, writeSensorLift } from './fill'
import { followSensorExplode } from './follow'
import {
  ALARM_COLOR,
  SENSOR_CLOUD_CAP,
  SENSOR_CLOUD_COUNT,
  SENSOR_COLOR,
  SENSOR_EXPLODE_CLEARANCE_M,
  SENSOR_EXPLODE_GAP_M,
  SENSOR_POINT_SIZE,
  SENSOR_POINT_XZ,
  SENSOR_POINTS_AFTER_FIRST_MS,
  SENSOR_POINTS_LAYERS,
  SENSOR_POINTS_PER_FLOOR,
  SENSOR_Y_FRACTION,
  sensorExplodeLift,
  sensorPointY,
  sensorPointsChunkDue,
  sensorPointsDueLatched,
  sensorPointsOptOut,
  sensorPointsOptOutAtBoot,
  sensorPointsSearchOfUrl,
  sensorPointsState,
  sensorPointsVisible,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(relative: string): string {
  return readFileSync(join(here, relative), 'utf8')
}

const sensorRgb = (() => {
  const color = new Color(SENSOR_COLOR)
  return [color.r, color.g, color.b] as const
})()
const alarmRgb = (() => {
  const color = new Color(ALARM_COLOR)
  return [color.r, color.g, color.b] as const
})()

describe('点云门闩', () => {
  it('只在总览打开，夜景和白模仍开，单层蓝图和开关关掉', () => {
    expect(sensorPointsState({ view: 'building', optOut: false }, true)).toBe('on')
    expect(sensorPointsVisible({ view: 'building', optOut: false }, true)).toBe(true)
    expect(sensorPointsState({ view: 'building', optOut: false }, false)).toBe('pending')
    expect(sensorPointsState({ view: 'floor', optOut: false }, true)).toBe('off-view')
    expect(sensorPointsState({ view: 'blueprint', optOut: false }, true)).toBe('off-view')
    expect(sensorPointsState({ view: 'building', optOut: true }, true)).toBe('off-switch')
    expect(sensorPointsVisible({ view: 'floor', optOut: false }, true)).toBe(false)
  })

  it('分包晚于首帧 2600ms，窗口过了一次就锁住', () => {
    expect(SENSOR_POINTS_AFTER_FIRST_MS).toBe(2600)
    expect(SENSOR_POINTS_AFTER_FIRST_MS).toBe(SOFT_SHADOW_CHUNK_AFTER_FIRST_MS)
    const first = 4_000
    expect(sensorPointsChunkDue(null, first)).toBe(false)
    expect(sensorPointsChunkDue(first, first + 2599)).toBe(false)
    expect(sensorPointsChunkDue(first, first + 2600)).toBe(true)
    const due = sensorPointsDueLatched(false, first, first + 2600)
    expect(sensorPointsDueLatched(due, null, first)).toBe(true)
    expect(sensorPointsDueLatched(due, undefined, Number.NaN)).toBe(true)
  })

  it('?sensorPoints=0 关掉，启动地址里的也算', () => {
    expect(sensorPointsOptOut('')).toBe(false)
    expect(sensorPointsOptOut('?sensorPoints=0')).toBe(true)
    expect(sensorPointsOptOut('sensorPoints=0&q=perf')).toBe(true)
    expect(sensorPointsOptOut('?sensorPoints=1')).toBe(false)
    expect(sensorPointsSearchOfUrl('http://127.0.0.1:5190/?sensorPoints=0#floor')).toBe('?sensorPoints=0')
    expect(sensorPointsOptOutAtBoot('', 'http://127.0.0.1:5190/?q=balanced&sensorPoints=0')).toBe(true)
    expect(sensorPointsOptOutAtBoot('?q=perf', 'http://127.0.0.1:5190/?q=perf')).toBe(false)
  })
})

describe('点位与告警色', () => {
  const specs = listFloorSpecs()

  it('颗数按楼层封顶，不随告警条数变长', () => {
    expect(specs).toHaveLength(23)
    expect(SENSOR_POINTS_PER_FLOOR).toBe(3)
    expect(SENSOR_CLOUD_COUNT).toBe(69)
    expect(SENSOR_CLOUD_COUNT).toBeLessThanOrEqual(SENSOR_CLOUD_CAP)
    expect(SENSOR_POINT_XZ).toHaveLength(3)
    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const colors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const crowded = specs.map((spec, index) => ({ id: spec.id, alarmCount: index === 2 ? 40 : 0 }))
    expect(writeSensorCloud(positions, colors, crowded, 0, sensorRgb, alarmRgb)).toBe(SENSOR_CLOUD_COUNT)
    const alarmFloors = crowded.filter((floor) => floor.alarmCount > 0)
    expect(alarmFloors).toHaveLength(1)
    expect(sensorAlarmFloorCount(crowded)).toBe(1)
    const near = (value: number, expected: number) => Math.abs(value - expected) < 1e-5
    let alarmPoints = 0
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      const offset = index * 3
      const alarm =
        near(colors[offset] ?? 0, alarmRgb[0]) &&
        near(colors[offset + 1] ?? 0, alarmRgb[1]) &&
        near(colors[offset + 2] ?? 0, alarmRgb[2])
      if (alarm) alarmPoints += 1
    }
    expect(alarmPoints).toBe(1)
    const allHot = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const allColors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const every = specs.map((spec) => ({ id: spec.id, alarmCount: 8 }))
    expect(writeSensorCloud(allHot, allColors, every, 0, sensorRgb, alarmRgb)).toBe(SENSOR_CLOUD_COUNT)
    let hot = 0
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      const offset = index * 3
      if (near(allColors[offset] ?? 0, alarmRgb[0])) hot += 1
    }
    expect(hot).toBe(specs.length)
    expect(sensorAlarmFloorCount(every)).toBe(specs.length)
  })

  it('告警色和圆标同色，安静点是另一色，XZ 是本地常量', () => {
    expect(ALARM_COLOR).toBe(STATUS_GLYPH.alarm.color)
    expect(SENSOR_COLOR).not.toBe(ALARM_COLOR)
    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const colors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    writeSensorCloud(positions, colors, [{ id: 'F12', alarmCount: 2 }], 0, sensorRgb, alarmRgb)
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      const place = SENSOR_POINT_XZ[index % SENSOR_POINTS_PER_FLOOR]
      expect(place).toBeTruthy()
      expect(positions[index * 3]).toBeCloseTo(place?.[0] ?? 0, 5)
      expect(positions[index * 3 + 2]).toBeCloseTo(place?.[1] ?? 0, 5)
    }
    const f12 = specs.findIndex((spec) => spec.id === 'F12')
    const sample = f12 * SENSOR_POINTS_PER_FLOOR
    expect(colors[sample * 3]).toBeCloseTo(sensorRgb[0], 5)
    expect(colors[(sample + 1) * 3]).toBeCloseTo(alarmRgb[0], 5)
    expect(colors[(sample + 2) * 3]).toBeCloseTo(sensorRgb[0], 5)
  })

  it('不和楼层徽标列叠在一起', () => {
    for (const spec of specs) {
      const badge = badgeAnchor(spec)
      for (const [x, z] of SENSOR_POINT_XZ) {
        const y = sensorPointY(spec.elevation, spec.height, 0, 0)
        expect(Math.hypot(x - badge.x, z - badge.z)).toBeGreaterThan(20)
        expect(Math.hypot(x - badge.x, y - badge.y, z - badge.z)).toBeGreaterThan(20)
      }
    }
  })

  it('Y 跟外壳爆炸偏移，进度 0 时贴在层身上', () => {
    expect(SENSOR_EXPLODE_GAP_M).toBe(EXPLODE_GAP_M)
    expect(SENSOR_EXPLODE_CLEARANCE_M).toBe(EXPLODE_GROUND_CLEARANCE_M)
    specs.forEach((spec, index) => {
      expect(sensorExplodeLift(index, 0)).toBe(0)
      expect(sensorExplodeLift(index, 1)).toBe(explodeOffset(index, 1))
      expect(sensorExplodeLift(index, 0.37)).toBeCloseTo(explodeOffset(index, 0.37), 8)
      const rest = spec.elevation + spec.height * SENSOR_Y_FRACTION
      expect(sensorPointY(spec.elevation, spec.height, index, 0)).toBeCloseTo(rest, 8)
      expect(sensorPointY(spec.elevation, spec.height, index, 1) - rest).toBeCloseTo(explodeOffset(index, 1), 8)
    })
  })

  it('爆炸只改 Y，不改 XZ 和颜色', () => {
    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const colors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    writeSensorCloud(positions, colors, [{ id: 'F3', alarmCount: 1 }], 0, sensorRgb, alarmRgb)
    const before = Float32Array.from(colors)
    const xs = positions.filter((_value, index) => index % 3 === 0)
    writeSensorLift(positions, SENSOR_CLOUD_COUNT, 1)
    expect(Array.from(colors)).toEqual(Array.from(before))
    positions.forEach((value, index) => {
      if (index % 3 === 0) expect(value).toBeCloseTo(xs[index / 3] ?? 0, 5)
      if (index % 3 === 2) expect(value).toBeCloseTo(24, 5)
    })
    expect(positions[1]).toBeGreaterThan(0)
  })

  it('告警数字没变时 key 不变，跟楼层数组顺序无关', () => {
    const floors = [
      { id: 'F12', alarmCount: 3 },
      { id: 'B1', alarmCount: 0 },
    ]
    expect(sensorAlarmKey(floors)).toBe(sensorAlarmKey([...floors].reverse()))
    expect(sensorAlarmKey(floors)).not.toBe(sensorAlarmKey([{ id: 'F12', alarmCount: 4 }]))
  })
})

describe('爆炸跟随不续帧', () => {
  it('进度没变就不动，变了只标 needsUpdate', () => {
    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const colors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    writeSensorCloud(positions, colors, [], 0, sensorRgb, alarmRgb)
    const held = { progress: 0 }
    const position = { needsUpdate: false }
    followSensorExplode(positions, SENSOR_CLOUD_COUNT, held, position, 0)
    expect(position.needsUpdate).toBe(false)
    const y0 = positions[1]
    followSensorExplode(positions, SENSOR_CLOUD_COUNT, held, position, 1)
    expect(position.needsUpdate).toBe(true)
    expect(positions[1]).toBeGreaterThan(y0)
    expect(held.progress).toBe(1)
    expect(read('./follow.ts')).not.toMatch(/invalidate\(/)
  })
})

describe('点云接线', () => {
  it('Points 和 PointMaterial 都懒挂在 dock 哈希之后，不进首屏', () => {
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./SensorCloud.tsx')
    const plan = read('./plan.ts')
    const probe = read('./probe.ts')
    const follow = read('./follow.ts')
    const plugin = read('../../scripts/sensorPointsPlugin.ts')
    const vite = read('../../vite.config.ts')
    const grid = read('../grid/mount.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
    }

    expect(dock).toContain(SENSOR_POINTS_SOURCE_BLOCK)
    expect(dock).toMatch(/let mountMeasure: \(\(\) => void\) \| null = null\n\n\/\/ T119：/)
    expect(dock).toMatch(/mountDiscardProxy\(\)\n\}\)\n\/\/ T118：/)
    expect(stripSensorPointsSource(dock)).toMatch(/mountDiscardProxy\(\)\n\}\)\n\/\/ T118：/)
    expect(stripSensorPointsSource(dock)).not.toMatch(/sensor-points|mountSensorPoints/)
    expect(stripSensorPointsSource(dock)).toMatch(
      /let mountMeasure: \(\(\) => void\) \| null = null\n\n\nfunction mountMeasureSoon\(\)/,
    )
    expect(() => stripSensorPointsSource('const dock = 1')).toThrow()
    expect(plugin).toContain(SENSOR_POINTS_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'sensor-points-after-hash'/)
    expect(plugin).toMatch(/assets\/SensorPoints\.js/)
    expect(plugin).toMatch(/assets\/SensorPointMaterial\.js/)
    expect(plugin).toMatch(/assets\/SensorCloud\.js/)
    expect(plugin).toMatch(/assets\/SensorPointsMount\.js/)
    expect(threeImportNames()).toEqual(
      expect.arrayContaining(['Color', 'DynamicDrawUsage', 'Group', 'Matrix4', 'PointsMaterial', 'Ray', 'Sphere', 'Vector3']),
    )

    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('gradientSkyAfterHash()')).toBeGreaterThanOrEqual(0)
    expect(plugins.indexOf('discardProxyAfterHash()')).toBeGreaterThan(plugins.indexOf('gradientSkyAfterHash()'))
    expect(plugins.indexOf('floorPlanAfterHash()')).toBeGreaterThan(plugins.indexOf('resizeFitAfterHash()'))
    expect(plugins.indexOf('sensorPointsAfterHash()')).toBeGreaterThan(plugins.indexOf('floorPlanAfterHash()'))
    expect(plugins.indexOf('sensorPointsAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(grid).toMatch(/__twinSensorPointsNode/)
    expect(composeOverlay.length).toBe(3)
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, 'points')).toBe('points')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, 'resize')).toBe('resize')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, null, 'mark')).toBe('mark')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, null, 'discard')).toBe('discard')
    expect(composeOverlay(null, null, null, null, null, null, null, null, null, 'sky')).toBe('sky')

    expect(mount).toMatch(/import\('\.\/SensorCloud'\)/)
    expect(mount).not.toMatch(/import \{ SensorCloud \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'|https?:|setFrameloop|invalidate\(/)
    expect(mount).toMatch(/__twinSensorPointsNode/)
    expect(mount).toMatch(/sensorPointsDueLatched/)
    expect(plan).not.toMatch(/from 'three'|@react-three|https?:|DeviceBadges|AlarmDrawer|listFloorSpecs/)
    expect(read('./fill.ts')).not.toMatch(/from 'three'|@react-three|https?:|DeviceBadges|AlarmDrawer/)
    expect(follow).not.toMatch(/invalidate|from 'three'|@react-three/)
    expect(probe).not.toMatch(/from 'three'|@react-three/)

    expect(live).toMatch(/from '@react-three\/drei\/core\/Points'/)
    expect(live).toMatch(/from '@react-three\/drei\/core\/PointMaterial'/)
    expect(live).toMatch(/<Points/)
    expect(live).toMatch(/<PointMaterial/)
    expect(live).toMatch(/vertexColors/)
    expect(live).toMatch(/followSensorExplode\(/)
    expect(live).toMatch(/raycast=\{ignoreSensorPick\}/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/<mesh|<instancedMesh|DeviceBadges|AlarmDrawer|Html/)
    expect(live).not.toMatch(/https?:|githack|jsdelivr|unpkg|setFrameloop/)
    expect(live).toMatch(/useFrame\(\(\) => \{\s*followSensorExplode\(/)
    expect(live).not.toMatch(/useFrame\(\(\) => \{[^}]*invalidate/)
    expect(SENSOR_POINT_SIZE).toBeGreaterThan(0)
    expect(SENSOR_POINTS_LAYERS).toEqual({
      badges: 'separate',
      labels: 'separate',
      alarmDom: 'separate',
      explode: 'follow-y',
    })

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/ExplodedLayout.tsx',
      '../components/AlarmDrawer.tsx',
      '../scene/stage/DeviceBadges.tsx',
      '../scene/stage/badges.ts',
      '../scene/explode.ts',
      '../scene/stage/RoomLabels.tsx',
      '../gradient-sky/GradientSky.tsx',
      '../overview-clouds/OverviewClouds.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/SensorCloud|mountSensorPoints|sensor-points|PointMaterial|sensorPoints/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
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
  })
})
