/**
 * T122：drei RoundedBox 只画这几只演示载体。
 * 展台、设备基座、两件简易道具，都在第 0 号工位的屏幕前方。
 * 不读工位总数，不改 WorkstationDesks / WorkstationChairs / InstancedProp 的矩阵或几何。
 * 总览、蓝图、楼层爆炸、工位拆解时不挂。drei 模块留在 hardGate 外面。
 */

export const ROUNDED_CARRIER_CAP = 4

/** 只抄这一只工位的世界矩阵。不是种子上限，也不会随工位数变长。 */
export const ROUNDED_ANCHOR_INDEX = 0

/**
 * 程序化工位桌面局部范围。来自 geometry.ts 的桌面 1.4×0.7，这里再写一份，
 * 懒包不去引那份会带上 three 的模块。
 */
export const DESK_BODY = {
  minX: -0.7,
  maxX: 0.7,
  minY: 0,
  maxY: 0.77,
  minZ: -0.35,
  maxZ: 0.35,
} as const

export const ROUNDED_BOX_LAYERS = {
  furniture: 'separate',
  explode: 'hidden',
  anchor: 'workstation-0',
} as const

export type RoundedKind = 'plinth' | 'device-base' | 'prop'

export interface RoundedCarrier {
  id: string
  kind: RoundedKind
  name: string
  /** 宽、高、深，米。网格中心在 position。 */
  args: readonly [number, number, number]
  radius: number
  smoothness: number
  bevelSegments: number
  steps: number
  creaseAngle: number
  /** 工位局部坐标，米。+Z 是椅侧，-Z 是屏幕侧。 */
  position: readonly [number, number, number]
  color: string
  roughness: number
  metalness: number
}

/**
 * 四只，硬顶就是这个长度。
 * 展台贴着第 0 张桌子的屏幕一侧，基座和一块道具叠在展台上，另一块道具落在展台一角。
 * 半径小于三条边的一半，挤出深度 depth − 2×radius 留得住。
 */
export const ROUNDED_CARRIERS: readonly RoundedCarrier[] = [
  {
    id: 'plinth',
    kind: 'plinth',
    name: 'RoundedPlinth',
    args: [0.72, 0.16, 0.46],
    radius: 0.04,
    smoothness: 4,
    bevelSegments: 2,
    steps: 1,
    creaseAngle: 0.4,
    position: [0, 0.08, -0.72],
    color: '#c4bfb6',
    roughness: 0.78,
    metalness: 0.02,
  },
  {
    id: 'device-base',
    kind: 'device-base',
    name: 'RoundedDeviceBase',
    args: [0.4, 0.036, 0.26],
    radius: 0.01,
    smoothness: 3,
    bevelSegments: 2,
    steps: 1,
    creaseAngle: 0.4,
    position: [0, 0.178, -0.72],
    color: '#3e444a',
    roughness: 0.42,
    metalness: 0.38,
  },
  {
    id: 'prop-block',
    kind: 'prop',
    name: 'RoundedPropBlock',
    args: [0.16, 0.12, 0.12],
    radius: 0.015,
    smoothness: 3,
    bevelSegments: 2,
    steps: 1,
    creaseAngle: 0.4,
    position: [0, 0.256, -0.72],
    color: '#efe6d6',
    roughness: 0.64,
    metalness: 0.02,
  },
  {
    id: 'prop-post',
    kind: 'prop',
    name: 'RoundedPropPost',
    args: [0.12, 0.2, 0.12],
    radius: 0.015,
    smoothness: 3,
    bevelSegments: 2,
    steps: 1,
    creaseAngle: 0.4,
    position: [0.28, 0.26, -0.72],
    color: '#6d8b72',
    roughness: 0.7,
    metalness: 0.04,
  },
]

export interface CarrierAabb {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export function carrierAabb(carrier: RoundedCarrier): CarrierAabb {
  const [width, height, depth] = carrier.args
  const [x, y, z] = carrier.position
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - height / 2,
    maxY: y + height / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }
}

/** drei 10.7.9 把深度收成 depth − 2×radius，再拿半径做倒角。 */
export function extrusionDepth(carrier: RoundedCarrier): number {
  return carrier.args[2] - carrier.radius * 2
}

export function radiusFits(carrier: RoundedCarrier): boolean {
  const [width, height, depth] = carrier.args
  return carrier.radius > 0 && carrier.radius < width / 2 && carrier.radius < height / 2 && carrier.radius < depth / 2
}

export function carrierKindCounts(): { plinth: number; 'device-base': number; prop: number } {
  const counts = { plinth: 0, 'device-base': 0, prop: 0 }
  for (const carrier of ROUNDED_CARRIERS) counts[carrier.kind] += 1
  return counts
}

export function aabbInteriorsOverlap(left: CarrierAabb, right: CarrierAabb, epsilon = 1e-4): boolean {
  return (
    left.minX < right.maxX - epsilon &&
    right.minX < left.maxX - epsilon &&
    left.minY < right.maxY - epsilon &&
    right.minY < left.maxY - epsilon &&
    left.minZ < right.maxZ - epsilon &&
    right.minZ < left.maxZ - epsilon
  )
}

export function aabbContainsXZ(outer: CarrierAabb, inner: CarrierAabb, epsilon = 1e-4): boolean {
  return (
    inner.minX >= outer.minX - epsilon &&
    inner.maxX <= outer.maxX + epsilon &&
    inner.minZ >= outer.minZ - epsilon &&
    inner.maxZ <= outer.maxZ + epsilon
  )
}

export type RoundedBoxState = 'on' | 'off-view' | 'off-explode' | 'off-station' | 'off-switch'

export interface RoundedBoxGate {
  view: string
  floorId: string | null
  optOut: boolean
  exploded: boolean
  explodeProgress: number
  stationActive: boolean
  stationAnimating: boolean
  stationProgress: number
}

/**
 * 单层、楼层没炸开、工位没拆开才画。
 * 爆炸进度一离开 0 就拆掉，载体不跟楼层矩阵走，也不写实例矩阵。
 */
export function roundedBoxState(gate: RoundedBoxGate): RoundedBoxState {
  if (gate.optOut) return 'off-switch'
  if (gate.view !== 'floor' || !gate.floorId) return 'off-view'
  if (gate.exploded || gate.explodeProgress > 0) return 'off-explode'
  if (gate.stationActive || gate.stationAnimating || gate.stationProgress > 0) return 'off-station'
  return 'on'
}

export function roundedBoxVisible(gate: RoundedBoxGate): boolean {
  return roundedBoxState(gate) === 'on'
}

/** `?roundedBox=0` 关掉。其他值和缺省都按开。 */
export function roundedBoxOptOut(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('roundedBox') === '0'
}

export function roundedBoxSearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 roundedBox，开关分包又晚于同步加载，所以也看启动地址。 */
export function roundedBoxOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return roundedBoxOptOut(live) || roundedBoxOptOut(roundedBoxSearchOfUrl(navigationUrl))
}
