/**
 * T072：讲解用的分区辅线和 CAD 短线。
 * 只服务图层 / `?segments=1`。不读人流折线，也不生成测距段。
 * drei `<Segments>` 超过 limit 的子节点会静默不画，所以这里先截断并留下 dropped。
 */

export const SEGMENT_LIMIT = 48
export const PARTITION_COLOR = '#3ec6ff'
export const HELPER_COLOR = '#7dffb3'
/** 总览辅线抬到一层附近，关深度后从南立面也能看见。 */
export const OVERVIEW_Y = 6
/** 高于楼板和热力，低于桌面。 */
export const FLOOR_LIFT_M = 0.35
export const B1_ELEVATION_M = -5.5

export type SegmentRole = 'partition' | 'helper'

export interface BatchLine {
  id: string
  role: SegmentRole
  color: string
  start: [number, number, number]
  end: [number, number, number]
}

export interface SegmentBox {
  id: string
  role: SegmentRole
  x0: number
  x1: number
  z0: number
  z1: number
}

/**
 * 与 scene/stage/layout.ts 的标准层分区对齐（核心筒、会议室、前台、茶水、两侧工位区）。
 * 数字抄在这里，避免辅线包把 B1 配准拖进来。
 */
export const OVERVIEW_BOXES: readonly SegmentBox[] = [
  { id: 'plate', role: 'partition', x0: -31.4, x1: 31.5, z0: -12.5, z1: 12.15 },
  { id: 'core', role: 'partition', x0: -6.3, x1: 6.3, z0: -4.5, z1: 5.4 },
  { id: 'meet-w', role: 'partition', x0: -20.6, x1: -11.2, z0: -12.5, z1: -7.15 },
  { id: 'meet-c', role: 'partition', x0: -9.6, x1: -0.2, z0: -12.5, z1: -7.15 },
  { id: 'meet-e', role: 'partition', x0: 1.2, x1: 10.8, z0: -12.5, z1: -7.15 },
  { id: 'reception', role: 'partition', x0: -7.6, x1: 3.2, z0: 7.7, z1: 12.15 },
  { id: 'pantry', role: 'partition', x0: 8.1, x1: 15.8, z0: 1.15, z1: 7.55 },
  { id: 'desk-w', role: 'partition', x0: -31.4, x1: -7.5, z0: -6.15, z1: 6.7 },
  { id: 'desk-e', role: 'partition', x0: 7.4, x1: 31.5, z0: -6.15, z1: 0.35 },
]

export interface FittedSegments {
  slots: BatchLine[]
  shown: number
  dropped: number
  limit: number
}

export function segmentsQueryOn(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('segments') === '1'
}

/** 地址栏同步会丢掉未知参数。从启动 URL 里取出 query，供晚加载的开关回读。 */
export function searchOfUrl(name: string): string {
  const queryAt = name.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = name.indexOf('#', queryAt)
  return hashAt < 0 ? name.slice(queryAt) : name.slice(queryAt, hashAt)
}

export function segmentsLayerOn(layers: object | null | undefined): boolean {
  if (!layers) return false
  return (layers as { segments?: boolean }).segments === true
}

/** 图层或演示参数。两者都缺省时关。参数只在挂载时播种图层，之后以图层为准。 */
export function segmentsWanted(layers: object | null | undefined, search = ''): boolean {
  return segmentsLayerOn(layers) || segmentsQueryOn(search)
}

export function floorPlanUrl(floorId: string): string | null {
  if (!/^F(?:[1-9]|1\d|2[0-2])$/.test(floorId)) return null
  return `/floors/F${floorId.slice(1).padStart(2, '0')}.json`
}

export function segmentToggleTitle(state: { on: boolean; shown: number; dropped: number; limit: number }): string {
  if (!state.on) return `DEMO 分区辅线，最多 ${state.limit} 条。默认关。`
  if (state.dropped > 0) {
    return `已画 ${state.shown} 条，上限 ${state.limit}，另有 ${state.dropped} 条未画。`
  }
  return `已画 ${state.shown} 条，上限 ${state.limit}。`
}

export function batchLineSignature(lines: readonly BatchLine[]): string {
  let out = ''
  for (const line of lines) {
    const [x0, y0, z0] = line.start
    const [x1, y1, z1] = line.end
    out += `${line.color}${x0},${y0},${z0}>${x1},${y1},${z1};`
  }
  return out
}

function boxEdges(box: SegmentBox, y: number): BatchLine[] {
  const color = box.role === 'helper' ? HELPER_COLOR : PARTITION_COLOR
  const corners: Array<readonly [number, number]> = [
    [box.x0, box.z0],
    [box.x1, box.z0],
    [box.x1, box.z1],
    [box.x0, box.z1],
  ]
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length]!
    return {
      id: `${box.id}-${index}`,
      role: box.role,
      color,
      start: [corner[0], y, corner[1]],
      end: [next[0], y, next[1]],
    }
  })
}

/** 东南角两笔十字，标成 CAD 辅线，和分区框颜色分开。 */
export function helperCross(x: number, z: number, y: number, size = 1.6): BatchLine[] {
  return [
    {
      id: 'helper-x',
      role: 'helper',
      color: HELPER_COLOR,
      start: [x - size, y, z],
      end: [x + size, y, z],
    },
    {
      id: 'helper-z',
      role: 'helper',
      color: HELPER_COLOR,
      start: [x, y, z - size],
      end: [x, y, z + size],
    },
  ]
}

export function overviewLines(y = OVERVIEW_Y): BatchLine[] {
  const lines = OVERVIEW_BOXES.flatMap((box) => boxEdges(box, y))
  lines.push(...helperCross(16.2, 14.2, y))
  return lines
}

export function readRoomRings(raw: unknown): Array<Array<[number, number]>> {
  if (!raw || typeof raw !== 'object') return []
  const rooms = (raw as { rooms?: unknown }).rooms
  if (!Array.isArray(rooms)) return []
  const rings: Array<Array<[number, number]>> = []
  for (const room of rooms) {
    if (!room || typeof room !== 'object') continue
    const polygon = (room as { polygon?: unknown }).polygon
    if (!Array.isArray(polygon)) continue
    const ring: Array<[number, number]> = []
    for (const point of polygon) {
      if (!Array.isArray(point) || point.length < 2) continue
      const x = point[0]
      const z = point[1]
      if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) continue
      ring.push([x, z])
    }
    if (ring.length >= 3) rings.push(ring)
  }
  return rings
}

export function floorPartitionLines(rings: readonly (readonly (readonly [number, number])[])[], y: number): BatchLine[] {
  const lines: BatchLine[] = []
  const anchor = rings[0]?.[0] ?? [0, 0]
  lines.push(...helperCross(anchor[0], anchor[1], y, 1.2))
  rings.forEach((ring, ringIndex) => {
    for (let index = 0; index < ring.length; index += 1) {
      const start = ring[index]!
      const end = ring[(index + 1) % ring.length]!
      if (start[0] === end[0] && start[1] === end[1]) continue
      lines.push({
        id: `room-${ringIndex}-${index}`,
        role: 'partition',
        color: PARTITION_COLOR,
        start: [start[0], y, start[1]],
        end: [end[0], y, end[1]],
      })
    }
  })
  return lines
}

/**
 * 画出来的槽位永远等于 limit。
 * 不够的补成零长度，避免 drei 在条数变少时把旧坐标留在缓冲里。
 * 超出的记入 dropped，不交给 `<Segment>`。
 */
export function presentSegments(lines: readonly BatchLine[], limit = SEGMENT_LIMIT): FittedSegments {
  if (!Number.isInteger(limit) || limit < 1 || limit > SEGMENT_LIMIT) {
    throw new Error(`批线段上限必须是 1 到 ${SEGMENT_LIMIT}`)
  }
  const shownLines = lines.slice(0, limit)
  const anchor = shownLines[0]?.start ?? [0, -80, 0]
  const color = shownLines[0]?.color ?? PARTITION_COLOR
  const slots: BatchLine[] = []
  for (let index = 0; index < limit; index += 1) {
    const line = shownLines[index]
    if (line) {
      slots.push(line)
      continue
    }
    slots.push({
      id: `pad-${index}`,
      role: 'helper',
      color,
      start: [anchor[0], anchor[1], anchor[2]],
      end: [anchor[0], anchor[1], anchor[2]],
    })
  }
  return {
    slots,
    shown: shownLines.length,
    dropped: lines.length - shownLines.length,
    limit,
  }
}
