/**
 * T123：单层平面图 SVG 叠层的门闩。
 * 只认这一份本地图纸。离开正交会话时组件卸下，这里不持有网格。
 * 和 extrude.ts / site.pdf 的挤出楼体分开：那边用标定轮廓挤出楼壳，
 * 这边只预算运行时 SVG 路径，避免面数暴涨。
 */

export const FLOOR_PLAN_SVG_URL = '/floor-plan/floor.svg' as const

export const FLOOR_PLAN_SVG_MAX_SHAPES = 16

export const FLOOR_PLAN_SVG_MAX_TRIANGLES = 64

/** 解析之后若细分超出预算，叠层不留下。 */
export const FLOOR_PLAN_SVG_RUNTIME_MAX = 96

/** 贴在楼板顶面之上，避开和楼板共面。 */
export const FLOOR_PLAN_SVG_LIFT_M = 0.04

const ALLOWED_NS = new Set(['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink'])

const BANNED_TAG =
  /<(?:circle|ellipse|text|image|use|foreignObject|path|polygon|polyline|line|script|style|iframe|linearGradient|radialGradient|pattern|filter|mask)\b/i

export type FloorPlanSvgReason =
  | 'on'
  | 'unmounted'
  | 'idle'
  | 'missing'
  | 'remote'
  | 'over-budget'
  | 'empty'

export interface SvgInspection {
  ok: boolean
  reason: FloorPlanSvgReason
  shapes: number
  triangles: number
}

export interface SvgContentBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface FloorPlateBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface SvgFit {
  x: number
  y: number
  z: number
  scaleX: number
  scaleY: number
  rotationX: number
}

export function isLocalFloorPlanSvg(src: string): boolean {
  return src === FLOOR_PLAN_SVG_URL
}

function foreignReference(text: string): boolean {
  if (/\burl\s*\(/i.test(text) || /data:|blob:|javascript:/i.test(text)) return true
  const http = text.match(/https?:\/\/[^\s"'<>]+/g) ?? []
  for (const url of http) {
    if (!ALLOWED_NS.has(url)) return true
  }
  const rest = text.replace(/https?:\/\/[^\s"'<>]+/g, '')
  return /\/\/[A-Za-z0-9]/.test(rest)
}

/** 只放行少量直角矩形。曲线、描边和外部引用在解析前就拒绝。 */
export function inspectFloorPlanSvg(text: string): SvgInspection {
  const empty = { ok: false, reason: 'empty' as const, shapes: 0, triangles: 0 }
  if (!text.includes('<svg')) return empty
  if (foreignReference(text)) return { ok: false, reason: 'remote', shapes: 0, triangles: 0 }
  if (BANNED_TAG.test(text) || /\srx\s*=/i.test(text) || /\sry\s*=/i.test(text)) {
    return { ok: false, reason: 'over-budget', shapes: 0, triangles: 0 }
  }
  const shapes = text.match(/<rect\b/gi)?.length ?? 0
  const triangles = shapes * 2
  if (shapes === 0) return empty
  if (shapes > FLOOR_PLAN_SVG_MAX_SHAPES || triangles > FLOOR_PLAN_SVG_MAX_TRIANGLES) {
    return { ok: false, reason: 'over-budget', shapes, triangles }
  }
  return { ok: true, reason: 'on', shapes, triangles }
}

/**
 * drei Svg 先把图纸 Y 翻成朝上。内容盒是翻转之后、贴地旋转之前的局部 XY。
 * 再绕 X 转 -90°，图纸上方（北）落到楼板较小的 Z。
 */
export function fitFloorPlanSvg(
  content: SvgContentBox,
  plate: FloorPlateBox,
  lift = FLOOR_PLAN_SVG_LIFT_M,
): SvgFit | null {
  const width = content.maxX - content.minX
  const height = content.maxY - content.minY
  const plateW = plate.maxX - plate.minX
  const plateD = plate.maxZ - plate.minZ
  const numbers = [width, height, plateW, plateD, plate.maxY, lift, content.minX, content.minY, content.maxX, content.maxY]
  if (numbers.some((value) => !Number.isFinite(value))) return null
  if (width <= 0 || height <= 0 || plateW <= 0 || plateD <= 0) return null
  const scaleX = plateW / width
  const scaleY = plateD / height
  return {
    x: plate.minX - content.minX * scaleX,
    y: plate.maxY + lift,
    z: plate.minZ + content.maxY * scaleY,
    scaleX,
    scaleY,
    rotationX: -Math.PI / 2,
  }
}

/** 局部点先缩放，再绕 X 转 -90°，最后平移。 */
export function mapSvgPoint(fit: SvgFit, x: number, y: number): { x: number; y: number; z: number } {
  const sx = x * fit.scaleX
  const sy = y * fit.scaleY
  return { x: fit.x + sx, y: fit.y, z: fit.z - sy }
}
