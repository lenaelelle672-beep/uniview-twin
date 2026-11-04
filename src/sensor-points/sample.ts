import { SENSOR_CLOUD_CAP, SENSOR_SAMPLE_COUNT } from './plan'

/**
 * T124：楼板表面采样。
 * 包围盒来自塔楼总览轮廓内缩，不是楼层徽标列。单测把四个数锁在 TOWER_OUTLINE_BOUNDS 上。
 * 采样板不进场景常驻：drei 的 useLayoutEffect 写完缓冲就拆。
 */
export const PLATE_INSET_M = 4
export const PLATE_MIN_X = -31.3093 + PLATE_INSET_M
export const PLATE_MAX_X = 30.2001 - PLATE_INSET_M
export const PLATE_MIN_Z = -14.8969 + PLATE_INSET_M
export const PLATE_MAX_Z = 22.632 - PLATE_INSET_M

/** MeshSurfaceSampler 在构造时记下当时的 Math.random。换上种子后再构造，采样完立刻交还。 */
export const SENSOR_SAMPLE_SEED = 0x07124

const scratch = new Float32Array(SENSOR_SAMPLE_COUNT * 3)
let passes = 0
let installed: (() => number) | null = null
let previousRandom: (() => number) | null = null

/** 两片三角形，不带 index，避免 MeshSurfaceSampler 打出 indexed 警告。 */
export function floorPlatePositions(): Float32Array {
  const y = 0
  const x0 = PLATE_MIN_X
  const x1 = PLATE_MAX_X
  const z0 = PLATE_MIN_Z
  const z1 = PLATE_MAX_Z
  return new Float32Array([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1])
}

export const FLOOR_PLATE_POSITIONS = floorPlatePositions()

/** mulberry32。只供给这一次表面采样。 */
export function createSampleRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function installSampleRandom(): void {
  if (installed) return
  previousRandom = Math.random
  installed = createSampleRandom(SENSOR_SAMPLE_SEED)
  Math.random = installed
}

export function restoreSampleRandom(): void {
  if (installed && previousRandom && Math.random === installed) Math.random = previousRandom
  installed = null
  previousRandom = null
}

export function readSurfaceSample(): Float32Array {
  return scratch
}

export function surfaceSampleReady(): boolean {
  return passes > 0
}

export function resetSurfaceSampleForTests(): void {
  passes = 0
  scratch.fill(0)
  restoreSampleRandom()
}

/**
 * drei Sampler 的 transform。一轮 0..count-1 写完就锁住。
 * 之后 effect 再跑（StrictMode、告警重挂）也不改缓冲。采样不进帧循环。
 */
export function captureSurfaceSample(
  sample: { position: { x: number; y: number; z: number } },
  index: number,
): void {
  if (passes > 0) return
  if (index < 0 || index >= SENSOR_SAMPLE_COUNT) return
  const offset = index * 3
  scratch[offset] = sample.position.x
  scratch[offset + 1] = sample.position.y
  scratch[offset + 2] = sample.position.z
  if (index + 1 >= SENSOR_SAMPLE_COUNT) passes = 1
}

/**
 * 把一次采样的 XZ 铺进已有点云缓冲。Y 和颜色不动，爆炸跟随仍只改 Y。
 * 颗数不超过 cap，也不超过缓冲和采样槽位能铺满的范围。
 */
export function applySurfaceSamples(
  positions: Float32Array,
  samples: ArrayLike<number>,
  sampleCount: number,
  pointCount: number,
): number {
  if (sampleCount <= 0 || pointCount <= 0) return 0
  const room = Math.min(SENSOR_CLOUD_CAP, pointCount, Math.floor(positions.length / 3))
  const slots = Math.min(sampleCount, Math.floor(samples.length / 3))
  if (room <= 0 || slots <= 0) return 0
  let written = 0
  for (let index = 0; index < room; index += 1) {
    const src = (index % slots) * 3
    const x = samples[src]
    const z = samples[src + 2]
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) break
    positions[index * 3] = x
    positions[index * 3 + 2] = z
    written += 1
  }
  return written
}
