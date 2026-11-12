import { beforeEach, describe, expect, it } from 'vitest'
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial, Triangle, Vector3 } from 'three'
import { MeshSurfaceSampler } from 'three-stdlib'
import { listFloorSpecs } from '../data/floors'
import { badgeAnchor } from '../scene/badges'
import { TOWER_OUTLINE_BOUNDS } from '../scene/shell/rings'
import { TRIANGLE_CLASS } from '../../scripts/sensorPointsPlugin'
import { writeSensorCloud, writeSensorLift } from './fill'
import { followSensorExplode } from './follow'
import {
  ALARM_COLOR,
  SENSOR_CLOUD_CAP,
  SENSOR_CLOUD_COUNT,
  SENSOR_COLOR,
  SENSOR_POINT_XZ,
  SENSOR_SAMPLE_COUNT,
} from './plan'
import {
  FLOOR_PLATE_POSITIONS,
  PLATE_INSET_M,
  PLATE_MAX_X,
  PLATE_MAX_Z,
  PLATE_MIN_X,
  PLATE_MIN_Z,
  applySurfaceSamples,
  captureSurfaceSample,
  createSampleRandom,
  floorPlatePositions,
  installSampleRandom,
  readSurfaceSample,
  resetSurfaceSampleForTests,
  restoreSampleRandom,
  surfaceSampleReady,
} from './sample'

const sensorRgb = (() => {
  const color = new Color(SENSOR_COLOR)
  return [color.r, color.g, color.b] as const
})()
const alarmRgb = (() => {
  const color = new Color(ALARM_COLOR)
  return [color.r, color.g, color.b] as const
})()

beforeEach(() => {
  resetSurfaceSampleForTests()
})

describe('楼板采样一次', () => {
  it('板在塔楼轮廓内，不在徽标列上', () => {
    expect(PLATE_MIN_X).toBeCloseTo(TOWER_OUTLINE_BOUNDS.minX + PLATE_INSET_M, 8)
    expect(PLATE_MAX_X).toBeCloseTo(TOWER_OUTLINE_BOUNDS.maxX - PLATE_INSET_M, 8)
    expect(PLATE_MIN_Z).toBeCloseTo(TOWER_OUTLINE_BOUNDS.minZ + PLATE_INSET_M, 8)
    expect(PLATE_MAX_Z).toBeCloseTo(TOWER_OUTLINE_BOUNDS.maxZ - PLATE_INSET_M, 8)
    expect(PLATE_MIN_X).toBeLessThan(PLATE_MAX_X)
    expect(PLATE_MIN_Z).toBeLessThan(PLATE_MAX_Z)
    expect(FLOOR_PLATE_POSITIONS).toHaveLength(18)
    expect(floorPlatePositions()).toEqual(FLOOR_PLATE_POSITIONS)
    const specs = listFloorSpecs()
    for (let index = 0; index < FLOOR_PLATE_POSITIONS.length; index += 3) {
      const x = FLOOR_PLATE_POSITIONS[index] ?? 0
      const z = FLOOR_PLATE_POSITIONS[index + 2] ?? 0
      for (const spec of specs) {
        const badge = badgeAnchor(spec)
        expect(Math.hypot(x - badge.x, z - badge.z)).toBeGreaterThan(20)
      }
    }
  })

  it('种子随机可复现，换上之后会交还 Math.random', () => {
    const first = createSampleRandom(0x07124)
    const second = createSampleRandom(0x07124)
    const values = [first(), first(), first()]
    expect([second(), second(), second()]).toEqual(values)
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    const original = Math.random
    installSampleRandom()
    expect(Math.random).not.toBe(original)
    restoreSampleRandom()
    expect(Math.random).toBe(original)
    restoreSampleRandom()
    expect(Math.random).toBe(original)
  })

  it('一轮写满就锁住，第二轮不改缓冲', () => {
    captureSurfaceSample({ position: { x: 1, y: 2, z: 3 } }, 0)
    captureSurfaceSample({ position: { x: 4, y: 5, z: 6 } }, 1)
    expect(surfaceSampleReady()).toBe(false)
    captureSurfaceSample({ position: { x: 7, y: 8, z: 9 } }, 2)
    expect(surfaceSampleReady()).toBe(true)
    const locked = Float32Array.from(readSurfaceSample())
    captureSurfaceSample({ position: { x: 99, y: 99, z: 99 } }, 0)
    captureSurfaceSample({ position: { x: 99, y: 99, z: 99 } }, 2)
    expect(Array.from(readSurfaceSample())).toEqual(Array.from(locked))
  })

  it('铺进点云时封顶，只改 XZ', () => {
    const samples = new Float32Array([5, 1, 6, 7, 2, 8, 9, 3, 10])
    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    positions.fill(0)
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) positions[index * 3 + 1] = 10 + index
    expect(applySurfaceSamples(positions, samples, SENSOR_SAMPLE_COUNT, SENSOR_CLOUD_COUNT)).toBe(SENSOR_CLOUD_COUNT)
    expect(SENSOR_CLOUD_COUNT).toBeLessThanOrEqual(SENSOR_CLOUD_CAP)
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      const slot = index % SENSOR_SAMPLE_COUNT
      expect(positions[index * 3]).toBe(samples[slot * 3])
      expect(positions[index * 3 + 1]).toBe(10 + index)
      expect(positions[index * 3 + 2]).toBe(samples[slot * 3 + 2])
    }
    const tiny = new Float32Array(5)
    expect(applySurfaceSamples(tiny, samples, 3, 1000)).toBe(1)
    expect(applySurfaceSamples(positions, samples, 0, 10)).toBe(0)
    const broken = new Float32Array([Number.NaN, 0, 1])
    const clean = new Float32Array([4, 0, 4])
    expect(applySurfaceSamples(clean, broken, 1, 1)).toBe(0)
    expect(clean[0]).toBe(4)
  })

  it('表面采样替换手摆 XZ，爆炸仍只改 Y，并且远离徽标', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(FLOOR_PLATE_POSITIONS, 3))
    const mesh = new Mesh(geometry, new MeshBasicMaterial())
    const warnings: unknown[][] = []
    const report = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args)
    }
    installSampleRandom()
    try {
      const sampler = new MeshSurfaceSampler(mesh)
      sampler.build()
      const position = new Vector3()
      const normal = new Vector3()
      const color = new Color()
      for (let index = 0; index < SENSOR_SAMPLE_COUNT; index += 1) {
        sampler.sample(position, normal, color)
        captureSurfaceSample({ position }, index)
      }
    } finally {
      console.warn = report
      restoreSampleRandom()
    }
    expect(warnings).toEqual([])
    expect(surfaceSampleReady()).toBe(true)
    const samples = readSurfaceSample()
    const seen = new Set<string>()
    for (let index = 0; index < SENSOR_SAMPLE_COUNT; index += 1) {
      const x = samples[index * 3] ?? 0
      const y = samples[index * 3 + 1] ?? 0
      const z = samples[index * 3 + 2] ?? 0
      expect(x).toBeGreaterThanOrEqual(PLATE_MIN_X - 1e-4)
      expect(x).toBeLessThanOrEqual(PLATE_MAX_X + 1e-4)
      expect(z).toBeGreaterThanOrEqual(PLATE_MIN_Z - 1e-4)
      expect(z).toBeLessThanOrEqual(PLATE_MAX_Z + 1e-4)
      expect(y).toBeCloseTo(0, 5)
      seen.add(`${x.toFixed(4)},${z.toFixed(4)}`)
      const hand = SENSOR_POINT_XZ[index]
      expect(hand).toBeTruthy()
      expect(Math.hypot(x - (hand?.[0] ?? 0), z - (hand?.[1] ?? 0))).toBeGreaterThan(1)
    }
    expect(seen.size).toBe(SENSOR_SAMPLE_COUNT)

    const before = Float32Array.from(samples)
    captureSurfaceSample({ position: { x: 0, y: 0, z: 0 } }, 0)
    expect(Array.from(samples)).toEqual(Array.from(before))

    const positions = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    const colors = new Float32Array(SENSOR_CLOUD_COUNT * 3)
    writeSensorCloud(positions, colors, [{ id: 'F3', alarmCount: 1 }], 0, sensorRgb, alarmRgb)
    const ys = positions.filter((_value, index) => index % 3 === 1)
    const colorBefore = Float32Array.from(colors)
    expect(applySurfaceSamples(positions, samples, SENSOR_SAMPLE_COUNT, SENSOR_CLOUD_COUNT)).toBe(SENSOR_CLOUD_COUNT)
    expect(Array.from(colors)).toEqual(Array.from(colorBefore))
    positions.forEach((value, index) => {
      if (index % 3 === 1) expect(value).toBeCloseTo(ys[(index - 1) / 3] ?? 0, 5)
    })
    const specs = listFloorSpecs()
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      const x = positions[index * 3] ?? 0
      const y = positions[index * 3 + 1] ?? 0
      const z = positions[index * 3 + 2] ?? 0
      for (const spec of specs) {
        const badge = badgeAnchor(spec)
        expect(Math.hypot(x - badge.x, z - badge.z)).toBeGreaterThan(20)
        expect(Math.hypot(x - badge.x, y - badge.y, z - badge.z)).toBeGreaterThan(20)
      }
    }
    const held = { progress: 0 }
    const position = { needsUpdate: false }
    followSensorExplode(positions, SENSOR_CLOUD_COUNT, held, position, 1)
    expect(position.needsUpdate).toBe(true)
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      const slot = index % SENSOR_SAMPLE_COUNT
      expect(positions[index * 3]).toBeCloseTo(samples[slot * 3] ?? 0, 5)
      expect(positions[index * 3 + 2]).toBeCloseTo(samples[slot * 3 + 2] ?? 0, 5)
      expect(positions[index * 3 + 1]).not.toBeCloseTo(ys[index] ?? 0, 5)
    }
    writeSensorLift(positions, SENSOR_CLOUD_COUNT, 0)
    for (let index = 0; index < SENSOR_CLOUD_COUNT; index += 1) {
      expect(positions[index * 3 + 1]).toBeCloseTo(ys[index] ?? 0, 5)
    }
  })
})

describe('采样用的 Triangle 和 three 一致', () => {
  it('面积和法线跟着 three.Triangle', () => {
    const factory = new Function('Vector3', `${TRIANGLE_CLASS}\nreturn Triangle`) as (
      vector: typeof Vector3,
    ) => new (
      a?: Vector3,
      b?: Vector3,
      c?: Vector3,
    ) => { getArea: () => number; getNormal: (target: Vector3) => Vector3 }
    const ShimTriangle = factory(Vector3)
    const cases = [
      [new Vector3(0, 0, 0), new Vector3(2, 0, 0), new Vector3(0, 0, 2)],
      [new Vector3(PLATE_MIN_X, 0, PLATE_MIN_Z), new Vector3(PLATE_MAX_X, 0, PLATE_MIN_Z), new Vector3(PLATE_MAX_X, 0, PLATE_MAX_Z)],
      [new Vector3(1, 2, 3), new Vector3(1, 2, 3), new Vector3(4, 5, 6)],
    ]
    for (const [a, b, c] of cases) {
      if (!a || !b || !c) continue
      const shim = new ShimTriangle(a.clone(), b.clone(), c.clone())
      const real = new Triangle(a.clone(), b.clone(), c.clone())
      expect(shim.getArea()).toBeCloseTo(real.getArea(), 8)
      const shimNormal = new Vector3()
      const realNormal = new Vector3()
      shim.getNormal(shimNormal)
      real.getNormal(realNormal)
      expect(shimNormal.x).toBeCloseTo(realNormal.x, 8)
      expect(shimNormal.y).toBeCloseTo(realNormal.y, 8)
      expect(shimNormal.z).toBeCloseTo(realNormal.z, 8)
    }
  })
})
