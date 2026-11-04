/**
 * T114：昼间总览的渐变天幕。
 * 颜色由 drei GradientTexture 在本地 canvas 上画出，没有贴图请求，也不引入新的 npm。
 * 挂在跟随相机的背面球上，只按仰角取色：
 * 球的 uv.y 与极角成线性，GradientTexture 的第 0 档落在天顶，0.5 落在地平线。
 */

/** 与 SCENE_BACKGROUND.day 同一个十六进制。底色条和清屏色、昼雾色对齐。 */
export const GRADIENT_SKY_BASE = '#bdd2e6'

/**
 * 与软阴影、云层同一道首帧后窗口。
 * 字面量写在这里，懒包不再去引那份带 three 的门闩模块。
 */
export const GRADIENT_SKY_AFTER_FIRST_MS = 2600

export interface GradientSkyBand {
  /** 仰角，度。正值在地平线之上。 */
  elevation: number
  color: string
}

/**
 * 总览拟合后机位约在 (39, 220, 433)，俯 24°，竖直视场 33°。
 * 画面里露出来的天全在地平线以下：场地远缘约 -24°，画面上沿约 -7.5°。
 * 所以底色条铺到 -26°，往上逐档加蓝，天顶最深。
 * 颜色是 AgX（曝光 1.95）之前的值，括号里是均衡档实测/推算的上屏色。
 * 从上到下排列；GradientTexture 要求 stops 单调递增。
 */
export const GRADIENT_SKY_BANDS: readonly GradientSkyBand[] = [
  { elevation: 90, color: '#5072af' }, // #83a2c8
  { elevation: 25, color: '#6688c6' }, // #98b2d1
  { elevation: 0, color: '#7fa4da' }, // #acc1d7
  { elevation: -10, color: '#93b6e6' }, // #b8c9da
  { elevation: -18, color: '#afcae9' }, // #c5d0da
  { elevation: -26, color: GRADIENT_SKY_BASE }, // #cbd3d9，与原清屏色上屏一致
  { elevation: -90, color: GRADIENT_SKY_BASE },
]

/** 仰角换成 GradientTexture 的 stop：天顶 0，地平线 0.5，天底 1。 */
export function elevationStop(elevation: number): number {
  const clamped = Math.min(90, Math.max(-90, elevation))
  return 0.5 - clamped / 180
}

export const GRADIENT_SKY_STOPS: readonly number[] = GRADIENT_SKY_BANDS.map((band) => elevationStop(band.elevation))

export const GRADIENT_SKY_COLORS: readonly string[] = GRADIENT_SKY_BANDS.map((band) => band.color)

/** canvas 高 512、宽 4。只在竖直方向有变化，宽度够线性插值即可。 */
export const GRADIENT_SKY_SIZE = 512
export const GRADIENT_SKY_WIDTH = 4

/**
 * 球心每帧跟着相机。半径落在 near 0.35 与 far 2400 之间，拉远、爆炸都不会被裁掉。
 * 不写深度、不做深度测试，并且排在最前面画，楼、地、云都盖在它上面。
 */
export const GRADIENT_SKY_RADIUS = 1000
export const GRADIENT_SKY_WIDTH_SEGMENTS = 32
export const GRADIENT_SKY_HEIGHT_SEGMENTS = 32
export const GRADIENT_SKY_ORDER = -1000

export interface GradientSkyGate {
  view: string
  dayNight: string
  presentation: string
  optOut: boolean
}

/** 场景里已经有 drei Sky，或者有人把 HDR 当了背景。 */
export type ForeignSky = 'sky' | 'hdr-background' | null

export type GradientSkyState =
  | 'on'
  | 'pending'
  | 'off-view'
  | 'off-night'
  | 'off-model'
  | 'off-switch'
  | 'yield-sky'
  | 'yield-hdr-background'

/**
 * 分层与互斥：
 * - T106 云层：分层。同一道昼间总览门闩，云是透明件，后画，盖在天幕上。
 * - LocalEnvironment：分层。HDR 只进 scene.environment 做反射，天幕不读也不写它。
 * - drei Sky / HDR 背景：互斥。场景里一旦有，天幕让位，不叠脏。
 * - CDN Environment preset：不用。
 */
export const GRADIENT_SKY_LAYERS = {
  clouds: 'above',
  environment: 'reflection-only',
  sky: 'exclusive',
  hdrBackground: 'exclusive',
  cdnEnvironment: 'forbidden',
} as const

/** 只在昼间总览实景里画。夜景、白模、单层、蓝图、开关关掉都不挂。 */
export function gradientSkyState(gate: GradientSkyGate, foreign: ForeignSky = null): GradientSkyState {
  if (gate.optOut) return 'off-switch'
  if (gate.view !== 'building') return 'off-view'
  if (gate.presentation !== 'lit') return 'off-model'
  if (gate.dayNight !== 'day') return 'off-night'
  if (foreign === 'sky') return 'yield-sky'
  if (foreign === 'hdr-background') return 'yield-hdr-background'
  return 'on'
}

export function gradientSkyVisible(gate: GradientSkyGate, foreign: ForeignSky = null): boolean {
  return gradientSkyState(gate, foreign) === 'on'
}

export function gradientSkyChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= GRADIENT_SKY_AFTER_FIRST_MS
}

/**
 * 窗口过了一次就一直算过。
 * 爆炸、以及偶发的 RenderProbe 重跑会删掉首帧标记，云层因此退回待挂；天幕不跟着闪回平色。
 */
export function gradientSkyDueLatched(latched: boolean, firstFrameAt: number | null | undefined, now: number): boolean {
  return latched || gradientSkyChunkDue(firstFrameAt, now)
}

/** `?skyGradient=0` 关掉天幕。其他值和缺省都按开。 */
export function gradientSkyOptOut(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('skyGradient') === '0'
}

export function searchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 skyGradient，开关分包又晚于同步加载，所以也看启动地址。 */
export function gradientSkyOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return gradientSkyOptOut(live) || gradientSkyOptOut(searchOfUrl(navigationUrl))
}

type SceneLike = {
  background?: unknown
  getObjectByProperty?: (name: string, value: unknown) => unknown
}

/** drei Sky 是 three 的 Sky 网格，带 isSky。HDR 或任何贴图背景都算外来天空。 */
export function detectForeignSky(scene: SceneLike): ForeignSky {
  const background = scene.background as { isTexture?: boolean } | null | undefined
  if (background && background.isTexture === true) return 'hdr-background'
  if (scene.getObjectByProperty?.('isSky', true)) return 'sky'
  return null
}
