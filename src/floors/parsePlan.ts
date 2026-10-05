import type { DeskRuleHit, FloorColumn, FloorCore, FloorDesk, FloorPlan, FloorRoom, FloorWall, WalkComponent } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = value[0]
  const z = value[1]
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null
  return [x, z]
}

function asRing(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return []
  const ring: Array<[number, number]> = []
  for (const item of value) {
    const pair = asPair(item)
    if (pair) ring.push(pair)
  }
  return ring
}

function firstRing(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value) || value.length === 0) return []
  const inner = value[0]
  if (Array.isArray(inner) && inner.length >= 2 && typeof inner[0] === 'number') {
    return asRing(value)
  }
  return asRing(inner)
}

function closeRing(ring: Array<[number, number]>): Array<[number, number]> {
  if (ring.length < 3) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] === last[0] && first[1] === last[1]) return ring
  return [...ring, first]
}

export function pointInRing(x: number, z: number, ring: Array<[number, number]>): boolean {
  const closed = closeRing(ring)
  let inside = false
  for (let index = 0, prev = closed.length - 1; index < closed.length; prev = index, index += 1) {
    const [xi, zi] = closed[index]
    const [xj, zj] = closed[prev]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + Number.EPSILON) + xi) {
      inside = !inside
    }
  }
  return inside
}

function parseColumns(raw: unknown): FloorColumn[] {
  if (!Array.isArray(raw)) return []
  const columns: FloorColumn[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const center = asPair(item.center)
    const w = item.w
    const d = item.d
    if (!center || typeof w !== 'number' || typeof d !== 'number') continue
    columns.push({
      id: typeof item.id === 'string' ? item.id : `C${columns.length + 1}`,
      x: center[0],
      z: center[1],
      w,
      d,
      shape: item.shape === 'round' ? 'round' : 'rect',
    })
  }
  return columns
}

function parseCores(raw: unknown): FloorCore[] {
  if (!Array.isArray(raw)) return []
  const cores: FloorCore[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const polygon = asRing(item.polygon)
    if (polygon.length < 3) continue
    cores.push({
      id: typeof item.id === 'string' ? item.id : `core${cores.length + 1}`,
      name: typeof item.name === 'string' ? item.name : '核心筒',
      polygon,
    })
  }
  return cores
}

function parseRooms(raw: unknown): FloorRoom[] {
  if (!Array.isArray(raw)) return []
  const rooms: FloorRoom[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const label = asPair(item.label)
    if (!label || typeof item.name !== 'string' || item.name.length === 0) continue
    const polygon = item.polygon == null ? null : asRing(item.polygon)
    rooms.push({
      name: item.name,
      label,
      polygon: polygon && polygon.length >= 3 ? polygon : null,
      confidence: typeof item.confidence === 'string' ? item.confidence : 'none',
    })
  }
  return rooms
}

function parseWalls(raw: unknown): FloorWall[] {
  if (!Array.isArray(raw)) return []
  const walls: FloorWall[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const a = asPair(item.a)
    const b = asPair(item.b)
    if (!a || !b) continue
    const kind = typeof item.kind === 'string' ? item.kind : 'wall'
    if (kind === 'wall-finish') continue
    walls.push({ kind, a, b })
  }
  return walls
}

function parseDesks(floorId: string, raw: unknown): FloorDesk[] {
  if (!Array.isArray(raw)) return []
  const desks: FloorDesk[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const center = asPair(item.center)
    const n = item.n
    if (!center || typeof n !== 'number' || !Number.isInteger(n) || n < 1) continue
    const size = asPair(item.size) ?? [1.4, 0.7]
    const rot = typeof item.rotY === 'number' && Number.isFinite(item.rotY) ? item.rotY : 0
    desks.push({
      id: `${floorId}-${n}`,
      n,
      x: center[0],
      z: center[1],
      rot,
      size,
      colEdgeDist_m: typeof item.colEdgeDist_m === 'number' ? item.colEdgeDist_m : Number.POSITIVE_INFINITY,
      nearestColumn: typeof item.nearestColumn === 'string' ? item.nearestColumn : null,
    })
  }
  desks.sort((left, right) => left.n - right.n)
  return desks
}

function parseWalkPaths(raw: unknown): Array<Array<[number, number]>> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((path) => asRing(path))
    .filter((path) => path.length >= 2)
}

function parseWalkMeta(raw: unknown): FloorPlan['walkMeta'] {
  if (!isRecord(raw)) return null
  const components: WalkComponent[] = []
  if (Array.isArray(raw.components)) {
    for (const item of raw.components) {
      if (!isRecord(item) || typeof item.name !== 'string') continue
      const index = Array.isArray(item.pathIndex) ? item.pathIndex : [0, 0]
      components.push({
        name: item.name,
        area_m2: typeof item.area_m2 === 'number' ? item.area_m2 : 0,
        paths: typeof item.paths === 'number' ? item.paths : 0,
        pathIndex: [Number(index[0]) || 0, Number(index[1]) || 0],
      })
    }
  }
  return {
    components,
    pathCount: typeof raw.pathCount === 'number' ? raw.pathCount : components.reduce((sum, item) => sum + item.paths, 0),
  }
}

function appDeskId(floorId: string, raw: string): string {
  const match = /^(?:B1|F0?\d{1,2})-(\d+)$/.exec(raw)
  if (!match) return raw
  return `${floorId}-${match[1]}`
}

function parseDeskRule(floorId: string, raw: unknown): FloorPlan['deskRule'] {
  if (!isRecord(raw)) return { min: Number.POSITIVE_INFINITY, violations: [] }
  const hits: DeskRuleHit[] = []
  if (Array.isArray(raw.list)) {
    for (const item of raw.list) {
      if (!isRecord(item) || typeof item.desk !== 'string' || typeof item.column !== 'string') continue
      if (typeof item.centreToColumnEdge_m !== 'number') continue
      hits.push({
        desk: appDeskId(floorId, item.desk),
        column: item.column,
        centreToColumnEdge_m: item.centreToColumnEdge_m,
      })
    }
  }
  return {
    min: typeof raw.minCentreToColumnEdge_m === 'number' ? raw.minCentreToColumnEdge_m : Number.POSITIVE_INFINITY,
    violations: hits,
  }
}

export function parseFloorPlan(floorId: string, raw: unknown): FloorPlan {
  if (!isRecord(raw)) throw new Error(`楼层图纸不是对象：${floorId}`)
  const outline = firstRing(raw.outline)
  if (outline.length < 3) throw new Error(`楼层图纸缺少外轮廓：${floorId}`)
  const desks = parseDesks(floorId, raw.desks)
  if (desks.length === 0) throw new Error(`楼层图纸没有工位：${floorId}`)
  return {
    floorId,
    outline,
    cores: parseCores(raw.cores),
    columns: parseColumns(raw.columns),
    rooms: parseRooms(raw.rooms),
    walls: parseWalls(raw.walls),
    desks,
    walkPaths: parseWalkPaths(raw.walkPaths),
    walkMeta: parseWalkMeta(raw.walkMeta),
    deskRule: parseDeskRule(floorId, isRecord(raw.meta) ? raw.meta.deskRule : null),
  }
}
