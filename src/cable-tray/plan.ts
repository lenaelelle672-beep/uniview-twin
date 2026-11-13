/**
 * T126：drei Tube 只画这几根静态管。
 * 电缆桥架、一根支管、一根立管，沿 CatmullRom 扫过。控制点和分段都很少。
 * 坐标是 FloorInterior 局部米，落在塔楼两座核心筒之间偏南的走道上空。
 * 水平管在内墙 2.55 m 之上、吊顶之下。不读工位表，不改实例家具。
 * 总览、蓝图、地下一层、楼层爆炸、工位拆解时不挂。shapes.js 留在 hardGate 外面。
 */

export const CABLE_RUN_CAP = 3
export const TUBE_POINT_CAP = 4
export const TUBE_SEGMENT_CAP = 12
export const TUBE_RADIAL_CAP = 6
export const TUBE_CURVE_TYPE = 'catmullrom' as const
export const TUBE_CURVE_TENSION = 0.5

/** 内墙挤出高度。水平管要留在这之上，避免穿进核心筒和隔墙。 */
export const INTERIOR_WALL_TOP_M = 2.55

export const CABLE_TRAY_LAYERS = {
  furniture: 'separate',
  explode: 'hidden',
  anchor: 'floor-interior',
} as const

export type CableKind = 'cable-tray' | 'pipe' | 'riser'

export interface CableRun {
  id: string
  kind: CableKind
  name: string
  /** 楼层局部坐标，米。CatmullRom 控制点，闭口为假。 */
  points: readonly (readonly [number, number, number])[]
  tubularSegments: number
  radius: number
  radialSegments: number
  closed: false
  color: string
  roughness: number
  metalness: number
}

/**
 * 三根，硬顶就是这个长度。
 * 桥架贴着核心筒南侧走道，东西向略向南弯。
 * 支管从桥架中段向北接到两筒之间。立管在桥架东端落到走道。
 */
export const CABLE_RUNS: readonly CableRun[] = [
  {
    id: 'spine',
    kind: 'cable-tray',
    name: 'CableTraySpine',
    points: [
      [-14.2, 2.86, -1.7],
      [-6, 2.96, -1.05],
      [2.2, 2.94, -1.15],
      [8.4, 2.84, -1.75],
    ],
    tubularSegments: 12,
    radius: 0.05,
    radialSegments: 6,
    closed: false,
    color: '#9aa3a8',
    roughness: 0.46,
    metalness: 0.52,
  },
  {
    id: 'branch',
    kind: 'pipe',
    name: 'NorthServicePipe',
    points: [
      [2.2, 2.94, -1.15],
      [4.4, 2.88, -2.35],
      [6.4, 2.8, -3.7],
      [8.2, 2.7, -5.05],
    ],
    tubularSegments: 10,
    radius: 0.028,
    radialSegments: 5,
    closed: false,
    color: '#7f8f86',
    roughness: 0.4,
    metalness: 0.34,
  },
  {
    id: 'riser',
    kind: 'riser',
    name: 'ServiceRiser',
    points: [
      [8.4, 2.84, -1.75],
      [9.35, 2.2, -0.85],
      [8.7, 1.45, -1.55],
      [9.15, 0.9, -1.05],
    ],
    tubularSegments: 8,
    radius: 0.022,
    radialSegments: 5,
    closed: false,
    color: '#b08968',
    roughness: 0.38,
    metalness: 0.58,
  },
]

export function tubeVertexCount(tubularSegments: number, radialSegments: number): number {
  return (tubularSegments + 1) * (radialSegments + 1)
}

export function cableRunVertexCount(run: CableRun): number {
  return tubeVertexCount(run.tubularSegments, run.radialSegments)
}

export type CableTrayState = 'on' | 'off-view' | 'off-basement' | 'off-explode' | 'off-station' | 'off-switch'

export interface CableTrayGate {
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
 * 地上单层、楼层没炸开、工位没拆开才画。
 * 地下一层的平面对不上这组塔楼走道，不挂。
 */
export function cableTrayState(gate: CableTrayGate): CableTrayState {
  if (gate.optOut) return 'off-switch'
  if (gate.view !== 'floor' || !gate.floorId) return 'off-view'
  if (gate.floorId === 'B1') return 'off-basement'
  if (gate.exploded || gate.explodeProgress > 0) return 'off-explode'
  if (gate.stationActive || gate.stationAnimating || gate.stationProgress > 0) return 'off-station'
  return 'on'
}

export function cableTrayVisible(gate: CableTrayGate): boolean {
  return cableTrayState(gate) === 'on'
}

/** `?cableTray=0` 关掉。其他值和缺省都按开。 */
export function cableTrayOptOut(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('cableTray') === '0'
}

export function cableTraySearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 cableTray，开关分包又晚于同步加载，所以也看启动地址。 */
export function cableTrayOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return cableTrayOptOut(live) || cableTrayOptOut(cableTraySearchOfUrl(navigationUrl))
}
