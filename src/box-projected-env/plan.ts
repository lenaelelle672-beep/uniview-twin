/**
 * T127：进入的楼层房间用 drei useBoxProjectedEnv 做盒投影。
 * 这里不 import drei，也不 import three。钩子留在另一包，并且源码没有 useFrame。
 * 环境贴图只认 LocalEnvironment 已经挂上的两张本地 HDR，不另拉文件。
 * 幕墙、格栅、接缝、铝翅、檐口继续用各自的 envMapIntensity，不进这张名单。
 */

/** 与 LocalEnvironment 的 OUTDOOR_HDR_URL / NIGHT_HDR_URL 同一路径。 */
export const BOX_ENV_HDR_URLS = [
  '/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
  '/hdr/modern_buildings_night_1k.hdr',
] as const

export type BoxEnvHdrUrl = (typeof BOX_ENV_HDR_URLS)[number]

/** 幕墙一侧的材质名。室内盒投影不改它们的 envMapIntensity。 */
export const CURTAIN_BOUNDARY_NAMES = ['幕墙', '格栅', '接缝', '铝翅', '檐口'] as const

/** materials.ts 里幕墙和格栅的 customProgramCacheKey。 */
export const CURTAIN_CACHE_KEYS = ['twin-curtain-v2', 'twin-grille-v1'] as const

export const BOX_ENV_LAYERS = {
  curtain: 'envMapIntensity-unchanged',
  indoor: 'onBeforeCompile',
  hdr: 'LocalEnvironment',
  balancedFx: 'forbidden',
  useFrame: 'none',
  reflector: 'forbidden',
  transmission: 'forbidden',
} as const

export interface RoomBox {
  position: [number, number, number]
  size: [number, number, number]
}

export interface SlabFootprint {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * 盒心在楼板足迹的平面中心、层高的一半。
 * 尺寸是楼板宽深和这一层的层高。世界坐标，不跟家具走。
 */
export function roomBoxFromSlab(slab: SlabFootprint, elevation: number, height: number): RoomBox | null {
  const width = slab.maxX - slab.minX
  const depth = slab.maxZ - slab.minZ
  if (!(width > 0.5) || !(depth > 0.5) || !(height > 1)) return null
  if (!Number.isFinite(elevation) || !Number.isFinite(slab.minX) || !Number.isFinite(slab.minZ)) return null
  return {
    position: [(slab.minX + slab.maxX) / 2, elevation + height / 2, (slab.minZ + slab.maxZ) / 2],
    size: [width, height, depth],
  }
}

export function sameRoomBox(prev: RoomBox | null, next: RoomBox | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  for (let index = 0; index < 3; index += 1) {
    if (Math.abs(prev.position[index] - next.position[index]) > 1e-3) return false
    if (Math.abs(prev.size[index] - next.size[index]) > 1e-3) return false
  }
  return true
}

export function isLocalBoxHdr(url: string | null | undefined): url is BoxEnvHdrUrl {
  return url === BOX_ENV_HDR_URLS[0] || url === BOX_ENV_HDR_URLS[1]
}

export type BoxEnvState = 'on' | 'off-switch' | 'off-view' | 'off-model' | 'off-explode'

export interface BoxEnvGate {
  view: string
  floorId: string | null
  presentation: string
  optOut: boolean
  exploded: boolean
  explodeProgress: number
}

/**
 * 人在单层房间里才打开。白模没有本地 HDR。爆炸时楼层离开原位，盒子对不上，卸掉。
 * 离开单层（总览、蓝图）也卸掉。
 */
export function boxEnvState(gate: BoxEnvGate): BoxEnvState {
  if (gate.optOut) return 'off-switch'
  if (gate.presentation === 'model') return 'off-model'
  if (gate.view !== 'floor' || !gate.floorId) return 'off-view'
  if (gate.exploded || gate.explodeProgress > 1e-3) return 'off-explode'
  return 'on'
}

export function boxEnvActive(gate: BoxEnvGate): boolean {
  return boxEnvState(gate) === 'on'
}

/** `?boxProjectedEnv=0` 关掉。其它取值和缺省都按开。 */
export function boxEnvOptOut(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('boxProjectedEnv') === '0'
}

export function boxEnvSearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 boxProjectedEnv，开关分包又晚于同步加载，所以也看启动地址。 */
export function boxEnvOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return boxEnvOptOut(live) || boxEnvOptOut(boxEnvSearchOfUrl(navigationUrl))
}
