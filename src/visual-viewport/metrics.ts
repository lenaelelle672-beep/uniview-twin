/**
 * T109：把 visualViewport 的宽高和 offset 收成 HUD 用的留白。
 * 布局视口用 window.innerWidth / innerHeight，和 offset 同一套坐标。
 * 负 offset（回弹）先按 0 再算对侧，避免桌面回弹把 HUD 推开。
 * 四边留白都不超过 1px 时视为重合，调用方不加 data-vv。
 */

export const VIEWPORT_SLACK_PX = 1

export interface VisualBox {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
}

export interface LayoutBox {
  width: number
  height: number
}

export interface HudViewport {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
  insetLeft: number
  insetTop: number
  insetRight: number
  insetBottom: number
  identity: boolean
}

export interface VisualViewportSnapshot {
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
  insetLeft: number
  insetTop: number
  insetRight: number
  insetBottom: number
  identity: boolean
}

const HUD_VARS = ['--vv-w', '--vv-h', '--vv-x', '--vv-y', '--vv-r', '--vv-b'] as const

export type HudVarName = (typeof HUD_VARS)[number]

export function hudVarNames(): readonly HudVarName[] {
  return HUD_VARS
}

function finite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function readVisualBox(source: VisualBox | null | undefined): VisualBox | null {
  if (!source) return null
  const { width, height, offsetLeft, offsetTop } = source
  if (!finite(width) || !finite(height) || !finite(offsetLeft) || !finite(offsetTop)) return null
  if (width <= 0 || height <= 0) return null
  return { width, height, offsetLeft, offsetTop }
}

export function readLayoutBox(source: LayoutBox | null | undefined): LayoutBox | null {
  if (!source) return null
  if (!finite(source.width) || !finite(source.height)) return null
  if (source.width <= 0 || source.height <= 0) return null
  return { width: source.width, height: source.height }
}

function clip(value: number): number {
  return value > VIEWPORT_SLACK_PX ? value : 0
}

export function readHudViewport(visual: VisualBox | null, layout: LayoutBox | null): HudViewport | null {
  const seen = readVisualBox(visual)
  const frame = readLayoutBox(layout)
  if (!seen || !frame) return null
  const originLeft = Math.max(0, seen.offsetLeft)
  const originTop = Math.max(0, seen.offsetTop)
  const insetLeft = clip(originLeft)
  const insetTop = clip(originTop)
  const insetRight = clip(frame.width - originLeft - seen.width)
  const insetBottom = clip(frame.height - originTop - seen.height)
  const identity = insetLeft === 0 && insetTop === 0 && insetRight === 0 && insetBottom === 0
  return {
    width: seen.width,
    height: seen.height,
    offsetLeft: seen.offsetLeft,
    offsetTop: seen.offsetTop,
    insetLeft,
    insetTop,
    insetRight,
    insetBottom,
    identity,
  }
}

/** 全屏期间只保留读数，四边留白清零，避免整页 HUD 跟着屏幕尺寸挪。 */
export function identityViewport(visual: VisualBox): HudViewport {
  return {
    width: visual.width,
    height: visual.height,
    offsetLeft: visual.offsetLeft,
    offsetTop: visual.offsetTop,
    insetLeft: 0,
    insetTop: 0,
    insetRight: 0,
    insetBottom: 0,
    identity: true,
  }
}

function px(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return `${rounded}px`
}

export function hudCssVars(viewport: HudViewport): Record<HudVarName, string> {
  return {
    '--vv-w': px(viewport.width),
    '--vv-h': px(viewport.height),
    '--vv-x': px(viewport.insetLeft),
    '--vv-y': px(viewport.insetTop),
    '--vv-r': px(viewport.insetRight),
    '--vv-b': px(viewport.insetBottom),
  }
}

export function visualViewportSnapshot(viewport: HudViewport): VisualViewportSnapshot {
  return {
    width: viewport.width,
    height: viewport.height,
    offsetLeft: viewport.offsetLeft,
    offsetTop: viewport.offsetTop,
    insetLeft: viewport.insetLeft,
    insetTop: viewport.insetTop,
    insetRight: viewport.insetRight,
    insetBottom: viewport.insetBottom,
    identity: viewport.identity,
  }
}
