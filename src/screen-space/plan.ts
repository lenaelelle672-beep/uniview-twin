/**
 * T116：总览里的一枚屏幕空间标注。
 * drei ScreenSpace 把子网格钉在相机前方的平面上，朝向跟相机一致。
 * 落点是塔楼平面中心、F12 标高投到这块平面上的位置。远近变化时屏上尺寸不变。
 *
 * 跟已有标注的分工：
 * - domHud：T109。visualViewport 写 --vv-*，挪的是顶栏、楼层面板、view-chip 这些 DOM。不进 WebGL。
 * - focusFloat：聚焦时一枚 drei Html，BBAnchor 钉在工位包围盒角。是 DOM，不是屏幕平面上的网格。
 * - billboard：T064 演示铭牌。世界坐标里的平面朝向镜头，尺寸是米，拉远会变小。
 * - projectedEm：单层房间字。按射影 em 反推世界字号，夹在 15–17px。
 * - screenSpace：本单。一枚网格，相机平面，塔楼平面中心的屏幕位置。
 * - screenSizer：禁止。它按距离把世界物体缩成恒定像素，和 projectedEm 抢字号。
 */

import { towerRow } from '../data/levels'

/** 与软阴影、天幕同一道首帧后窗口。字面量留在这里，懒包不去引那份带 three 的门闩。 */
export const SCREEN_MARK_AFTER_FIRST_MS = 2600

/**
 * 塔楼平面中心、F12 标高。原点约定见 floors.ts：Y 向上，塔楼平面中心在地面。
 * 屋面 100.2 在总览起始机位里贴着画面上沿外面，牌子改钉在塔身中段，起始机位就能看见。
 */
export const SCREEN_MARK_FLOOR = 'F12'
export const SCREEN_MARK_ANCHOR = { x: 0, y: towerRow(SCREEN_MARK_FLOOR).level_m, z: 0 } as const

/**
 * drei ScreenSpace 把子节点放在 position-z = -depth。
 * 正数才在相机前方。默认 -1 会落到相机背后。
 * 大于画布 near 0.35，并且贴在相机前，不放到楼的距离上。
 */
export const SCREEN_MARK_DEPTH = 2

/** 相机平面上的宽高（米）。总览 fov 33、视口高 768 时大约 36×142 像素。 */
export const SCREEN_MARK_WIDTH = 0.22
export const SCREEN_MARK_HEIGHT = 0.055

export const SCREEN_MARK_ORDER = 40
export const SCREEN_MARK_MAX = 1
export const SCREEN_MARK_LABEL = '塔楼'
export const SCREEN_MARK_FILL = '#122033'
export const SCREEN_MARK_INK = '#f4f1ea'
export const SCREEN_MARK_ACCENT = '#7eb6ff'
export const SCREEN_MARK_TEX_W = 256
export const SCREEN_MARK_TEX_H = 64

/** 收拢动画的进度噪声。大于这个值就当爆炸还没停。 */
export const SCREEN_MARK_PROGRESS_EPS = 1e-3

export const SCREEN_MARK_BOUNDS = {
  domHud: 't109-css',
  focusFloat: 'html-bbanchor',
  billboard: 'world-face-camera',
  projectedEm: 'world-em',
  screenSpace: 'one-camera-plane',
  screenSizer: 'forbidden',
} as const

export interface ScreenMarkGate {
  view: string
  presentation: string
  exploded: boolean
  progress: number | null
  optOut: boolean
}

export type ScreenMarkState = 'on' | 'pending' | 'off-view' | 'off-model' | 'off-explode' | 'off-switch'

export type ScreenMarkPlacementReason = 'in' | 'behind' | 'offscreen' | 'camera'

export interface ScreenMarkSample {
  viewZ: number
  ndcX: number
  ndcY: number
  fov: number
  aspect: number
  near: number
  depth: number
}

export interface ScreenMarkPlacement {
  x: number
  y: number
  visible: boolean
  reason: ScreenMarkPlacementReason
}

/** 只在总览实景、楼层收拢时挂。夜景也挂。白模、单层、蓝图、爆炸和开关关掉都不挂。 */
export function screenMarkState(gate: ScreenMarkGate): ScreenMarkState {
  if (gate.optOut) return 'off-switch'
  if (gate.view !== 'building') return 'off-view'
  if (gate.presentation !== 'lit') return 'off-model'
  if (gate.exploded) return 'off-explode'
  if (typeof gate.progress === 'number' && gate.progress > SCREEN_MARK_PROGRESS_EPS) return 'off-explode'
  return 'on'
}

export function screenMarkVisible(gate: ScreenMarkGate): boolean {
  return screenMarkState(gate) === 'on'
}

/**
 * 透视相机前方、视锥以内，换成 ScreenSpace 子平面上的局部坐标。
 * 相机局部 +X 朝右、+Y 朝上，和 NDC 同向。
 */
export function screenMarkOffset(sample: ScreenMarkSample): ScreenMarkPlacement {
  const { viewZ, ndcX, ndcY, fov, aspect, near, depth } = sample
  if (!(fov > 0) || fov >= 180 || !(aspect > 0) || !(near > 0) || !(depth > near)) {
    return { x: 0, y: 0, visible: false, reason: 'camera' }
  }
  if (!Number.isFinite(viewZ) || !(viewZ < -near)) {
    return { x: 0, y: 0, visible: false, reason: 'behind' }
  }
  if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY) || Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) {
    return { x: 0, y: 0, visible: false, reason: 'offscreen' }
  }
  const halfH = depth * Math.tan((fov * Math.PI) / 360)
  const halfW = halfH * aspect
  return { x: ndcX * halfW, y: ndcY * halfH, visible: true, reason: 'in' }
}

/** 竖直视场下的屏上高度。宽屏只改横向像素密度，这块牌子的像素高只跟视口高度和 fov 走。 */
export function screenMarkPixelHeight(viewportHeight: number, fov: number, depth = SCREEN_MARK_DEPTH): number {
  const halfH = depth * Math.tan((fov * Math.PI) / 360)
  return (SCREEN_MARK_HEIGHT / (halfH * 2)) * viewportHeight
}

export function screenMarkPixelWidth(viewportHeight: number, fov: number, depth = SCREEN_MARK_DEPTH): number {
  const halfH = depth * Math.tan((fov * Math.PI) / 360)
  return (SCREEN_MARK_WIDTH / (halfH * 2)) * viewportHeight
}

export function screenMarkChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= SCREEN_MARK_AFTER_FIRST_MS
}

/** 窗口过了一次就一直算过。爆炸或重跑删掉首帧标记时，不重新等 2600ms。 */
export function screenMarkDueLatched(latched: boolean, firstFrameAt: number | null | undefined, now: number): boolean {
  return latched || screenMarkChunkDue(firstFrameAt, now)
}

/** `?screenMark=0` 关掉。其他值和缺省都按开。 */
export function screenMarkOptOut(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('screenMark') === '0'
}

export function searchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 screenMark。开关分包晚于同步，所以也看启动地址。 */
export function screenMarkOptOutAtBoot(live: string, navigationUrl: string): boolean {
  return screenMarkOptOut(live) || screenMarkOptOut(searchOfUrl(navigationUrl))
}
