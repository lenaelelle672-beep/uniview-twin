/**
 * T068：作者面光的盏数和摆法。
 * 这个文件不 import three。默认总览不创建灯，打开开关后才按上限取前面几盏。
 */

/** 同时存在的矩形面光上限。多出来的预设留着，用来证明封顶会切掉。 */
export const RECT_AREA_CAP = 3

export interface RectAreaSpec {
  id: string
  color: string
  intensity: number
  width: number
  height: number
  position: [number, number, number]
  target: [number, number, number]
}

/**
 * 世界坐标，米。原点在塔楼平面中心，Y 向上。
 * 这是作者预览，不改观众路径上的半球光和平行光。
 * 第四盏故意超出上限，挂上时会被切掉。
 */
export const RECT_AREA_PRESETS: readonly RectAreaSpec[] = [
  {
    id: 'overhead',
    color: '#fff1d6',
    intensity: 28,
    width: 24,
    height: 14,
    position: [0, 96, 4],
    target: [0, 36, 4],
  },
  {
    id: 'east-fill',
    color: '#d5e4ff',
    intensity: 18,
    width: 16,
    height: 8,
    position: [48, 42, 28],
    target: [8, 24, 12],
  },
  {
    id: 'north-rim',
    color: '#ffd7b0',
    intensity: 14,
    width: 18,
    height: 7,
    position: [-6, 52, -36],
    target: [0, 28, 8],
  },
  {
    id: 'spare',
    color: '#ffffff',
    intensity: 2,
    width: 4,
    height: 4,
    position: [12, 20, 12],
    target: [0, 10, 0],
  },
]

export function cappedRectAreas(cap = RECT_AREA_CAP): RectAreaSpec[] {
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0
  return RECT_AREA_PRESETS.slice(0, Math.min(limit, RECT_AREA_CAP))
}

export function acceptsRectAreaKey(event: {
  key: string
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}): boolean {
  if (event.isComposing || event.repeat || event.altKey || event.metaKey || event.ctrlKey) return false
  if (event.key !== 'l' && event.key !== 'L') return false
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
  if (event.target?.isContentEditable) return false
  return true
}
