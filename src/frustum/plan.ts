/**
 * T076：视锥暂停的纯判断。
 * 不引用 drei、three，也不读取雾密度或镜头 smoothTime。
 * 均衡 / 高画质默认关。性能档默认开，哨兵半径再收一档（更早离开视锥）。
 * `?frustum=1` 强制开，`?frustum=0` 强制关。
 * 可见性只看 three 有没有把网格画进当前画面，不要套用页面观察器的比例参数。
 */

export type FrustumReason = 'off' | 'perf' | 'query' | 'query-off'

export interface FrustumWanted {
  on: boolean
  reason: FrustumReason
}

/** 性能档哨兵更小，主机更早被当成离开视锥。其它档位按包围球原半径。 */
export const PERF_SENTINEL_SCALE = 0.72

/** 只盯最远的这几盏路灯，避免每盏灯各挂一个常驻检测。 */
export const FAR_LAMP_CAP = 12

/** 路灯实例的哨兵半径（米）。盖住灯头，不拿整条马路的包围球。 */
export const LAMP_SENTINEL_RADIUS = 6

/** 聚焦闪烁环的外径约 1.28 m。 */
export const FLASH_SENTINEL_RADIUS = 1.6

export function frustumQuery(search: string): 'on' | 'off' | null {
  const query = search.startsWith('?') ? search.slice(1) : search
  const value = new URLSearchParams(query).get('frustum')
  if (value === '1') return 'on'
  if (value === '0') return 'off'
  return null
}

/**
 * 地址栏同步会丢掉未知参数。live 里没有 frustum 时，回读启动导航地址。
 */
export function pickFrustumSearch(live: string, entryName = ''): string {
  if (frustumQuery(live)) return live
  const queryAt = entryName.indexOf('?')
  if (queryAt < 0) return live
  const hashAt = entryName.indexOf('#', queryAt)
  const fromEntry = hashAt < 0 ? entryName.slice(queryAt) : entryName.slice(queryAt, hashAt)
  return frustumQuery(fromEntry) ? fromEntry : live
}

export function frustumPauseWanted(quality: string, search = ''): FrustumWanted {
  const query = frustumQuery(search)
  if (query === 'on') return { on: true, reason: 'query' }
  if (query === 'off') return { on: false, reason: 'query-off' }
  if (quality === 'perf') return { on: true, reason: 'perf' }
  return { on: false, reason: 'off' }
}

export function frustumSentinelScale(quality: string): number {
  return quality === 'perf' ? PERF_SENTINEL_SCALE : 1
}

export interface SpherePoint {
  x: number
  y: number
  z: number
  r: number
}

export function unionSphere(spheres: readonly SpherePoint[]): SpherePoint | null {
  if (spheres.length === 0) return null
  let x = 0
  let y = 0
  let z = 0
  for (const sphere of spheres) {
    x += sphere.x
    y += sphere.y
    z += sphere.z
  }
  const inv = 1 / spheres.length
  x *= inv
  y *= inv
  z *= inv
  let radius = 0
  for (const sphere of spheres) {
    const reach = Math.hypot(sphere.x - x, sphere.y - y, sphere.z - z) + sphere.r
    if (reach > radius) radius = reach
  }
  return { x, y, z, r: radius }
}

/** 列主序矩阵把局部点变到世界。半径乘上各轴里最大的缩放。 */
export function transformSphere(
  elements: ArrayLike<number>,
  center: { x: number; y: number; z: number },
  radius: number,
): SpherePoint {
  const x = elements[0] * center.x + elements[4] * center.y + elements[8] * center.z + elements[12]
  const y = elements[1] * center.x + elements[5] * center.y + elements[9] * center.z + elements[13]
  const z = elements[2] * center.x + elements[6] * center.y + elements[10] * center.z + elements[14]
  const scale = Math.max(
    Math.hypot(elements[0], elements[1], elements[2]),
    Math.hypot(elements[4], elements[5], elements[6]),
    Math.hypot(elements[8], elements[9], elements[10]),
  )
  return { x, y, z, r: radius * (scale || 1) }
}

export function instanceWorld(
  meshElements: ArrayLike<number>,
  instance: ArrayLike<number>,
  index: number,
): { x: number; y: number; z: number } {
  const offset = index * 16
  const x = instance[offset + 12] ?? 0
  const y = instance[offset + 13] ?? 0
  const z = instance[offset + 14] ?? 0
  return {
    x: meshElements[0] * x + meshElements[4] * y + meshElements[8] * z + meshElements[12],
    y: meshElements[1] * x + meshElements[5] * y + meshElements[9] * z + meshElements[13],
    z: meshElements[2] * x + meshElements[6] * y + meshElements[10] * z + meshElements[14],
  }
}

/** 清掉 3×3，留下平移，实例缩成看不见，但索引还在。 */
export function hideInstance(array: Float32Array, index: number): void {
  const offset = index * 16
  array[offset] = 0
  array[offset + 1] = 0
  array[offset + 2] = 0
  array[offset + 4] = 0
  array[offset + 5] = 0
  array[offset + 6] = 0
  array[offset + 8] = 0
  array[offset + 9] = 0
  array[offset + 10] = 0
}

export function readInstance(array: ArrayLike<number>, index: number): number[] {
  const offset = index * 16
  const values: number[] = []
  for (let i = 0; i < 16; i += 1) values.push(array[offset + i] ?? 0)
  return values
}

export function restoreInstance(array: Float32Array, index: number, saved: ArrayLike<number>): void {
  const offset = index * 16
  for (let i = 0; i < 16; i += 1) array[offset + i] = saved[i] ?? 0
}

export interface LampSpot {
  index: number
  x: number
  y: number
  z: number
}

/** 只保留离相机最远的 cap 盏，近处路灯不挂哨兵。 */
export function farthestLampIndexes(spots: readonly LampSpot[], camera: { x: number; y: number; z: number }, cap: number): number[] {
  const ranked = spots.map((spot) => ({
    index: spot.index,
    distance:
      (spot.x - camera.x) * (spot.x - camera.x) +
      (spot.y - camera.y) * (spot.y - camera.y) +
      (spot.z - camera.z) * (spot.z - camera.z),
  }))
  ranked.sort((left, right) => right.distance - left.distance || left.index - right.index)
  return ranked.slice(0, Math.max(0, cap)).map((spot) => spot.index)
}
