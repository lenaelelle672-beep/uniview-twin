/**
 * T065：告警焦点和 DEMO 墙面贴花。
 * 数量有上限。贴图只走 public/textures/decals，不读 CDN。
 * InstancedMesh 不能当 Decal 父级（会投到单位盒上）。
 * BatchedMesh 的几何是合批的，也不投影，改走平面 Image。
 */

export const STICKER_CAP = 3
export const DECAL_MESH_CAP = 2
export const STICKER_LIFT_M = 1.42
/** 与 scene/stage/cut.ts 的楼板厚度一致。本文件不引用那个模块，避免把切面逻辑打进贴花包。 */
export const STICKER_SLAB_M = 0.16
/** 内墙盒厚 0.12，中心线在线段上。贴在面外，避免 Decal 埋进墙体被深度测掉。 */
export const WALL_GAP_M = 0.1
export const MIN_WALL_M = 0.45
export const MAX_WALL_M = 12
export const ALERT_TEXTURE = '/textures/decals/alarm.png'
export const DEMO_TEXTURE = '/textures/decals/demo.png'

const LOCAL_PREFIX = '/textures/decals/'

export type ReceiverKind = 'mesh' | 'instanced' | 'batched' | 'missing'

export interface WallSeg {
  kind: string
  a: [number, number]
  b: [number, number]
}

export interface AnchorPoint {
  id: string
  role: 'alert' | 'demo'
  x: number
  z: number
}

export interface StickerView {
  id: string
  role: 'alert' | 'demo'
  mode: 'decal' | 'image'
  /** 最终投影用的接收体。mesh 才允许 Decal。 */
  receiver: ReceiverKind
  /** 墙在场景里本来的接收体。实例墙会换成自有平面。 */
  sceneKind: ReceiverKind
  x: number
  y: number
  z: number
  rotY: number
  width: number
  height: number
  texture: string
}

/**
 * B1 没有 public/floors JSON。四边与 layout.ts 的 CORE 一致，只给贴花找一面墙。
 */
export const B1_CORE_WALLS: readonly WallSeg[] = [
  { kind: 'core-wall', a: [-6.3, -4.5], b: [6.3, -4.5] },
  { kind: 'core-wall', a: [6.3, -4.5], b: [6.3, 5.4] },
  { kind: 'core-wall', a: [6.3, 5.4], b: [-6.3, 5.4] },
  { kind: 'core-wall', a: [-6.3, 5.4], b: [-6.3, -4.5] },
]

const PROJECTABLE = new Set(['wall', 'glass', 'core-wall', 'shaft-wall', 'stair-wall'])

export function decalsLayerOn(layers: object | null | undefined): boolean {
  if (!layers) return false
  return (layers as { decals?: boolean }).decals === true
}

export function assertLocalDecalUrl(url: string): string {
  if (!url.startsWith(LOCAL_PREFIX) || url.includes('://') || url.includes('..') || url.includes('\\')) {
    throw new Error('贴花贴图只能来自本地 public/textures/decals')
  }
  return url
}

export function receiverKind(object: {
  isMesh?: boolean
  isInstancedMesh?: boolean
  isBatchedMesh?: boolean
} | null | undefined): ReceiverKind {
  if (!object) return 'missing'
  if (object.isBatchedMesh) return 'batched'
  if (object.isInstancedMesh) return 'instanced'
  if (object.isMesh) return 'mesh'
  return 'missing'
}

/** 只有普通 Mesh 能做 Decal 父级。 */
export function acceptsDecalReceiver(kind: ReceiverKind): boolean {
  return kind === 'mesh'
}

/**
 * 场景里若出现名叫墙的 BatchedMesh，整面都不要投影。
 * 遍历只看标记，不创建几何。
 */
export function sceneBlocksDecal(root: {
  traverse?: (fn: (obj: { isBatchedMesh?: boolean; name?: string }) => void) => void
} | null | undefined): boolean {
  if (!root?.traverse) return false
  let blocked = false
  root.traverse((obj) => {
    if (!obj.isBatchedMesh) return
    const name = obj.name ?? ''
    if (name.length === 0 || /wall|core|glass|curtain/i.test(name)) blocked = true
  })
  return blocked
}

/**
 * 图纸墙在场景里的画法。
 * core-wall 收进 FloorCores 合并网格，是普通 Mesh。
 * 其余内墙和玻璃是 InstancedMesh。
 * 场景里已经有 Batched 墙时，不再区分，全部拒绝投影。
 */
export function sceneKindForWall(kind: string, batchedBlocked: boolean): ReceiverKind {
  if (batchedBlocked) return 'batched'
  if (kind === 'core-wall') return 'mesh'
  return 'instanced'
}

/**
 * 实例墙不把 Decal 挂到 InstancedMesh 上，改贴一块自有平面（仍是普通 Mesh）。
 * Batched 不造替代面，调用方应改走 Image。
 */
export function receiverForScene(sceneKind: ReceiverKind): ReceiverKind {
  if (sceneKind === 'instanced') return 'mesh'
  return sceneKind
}

export function stickerWorldY(elevation: number, lift = 0): number {
  return elevation + STICKER_SLAB_M + STICKER_LIFT_M + lift
}

export function readWalls(raw: unknown): WallSeg[] {
  if (!raw || typeof raw !== 'object') return []
  const walls = (raw as { walls?: unknown }).walls
  if (!Array.isArray(walls)) return []
  const out: WallSeg[] = []
  for (const item of walls) {
    if (!item || typeof item !== 'object') continue
    const rec = item as { kind?: unknown; a?: unknown; b?: unknown }
    if (typeof rec.kind !== 'string' || !PROJECTABLE.has(rec.kind)) continue
    const a = pair(rec.a)
    const b = pair(rec.b)
    if (!a || !b) continue
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_WALL_M) continue
    out.push({ kind: rec.kind, a, b })
  }
  return out
}

export function readDesks(raw: unknown): Array<{ id: string; x: number; z: number }> {
  if (!raw || typeof raw !== 'object') return []
  const desks = (raw as { desks?: unknown }).desks
  if (!Array.isArray(desks)) return []
  const out: Array<{ id: string; x: number; z: number }> = []
  for (const item of desks) {
    if (!item || typeof item !== 'object') continue
    const rec = item as { id?: unknown; center?: unknown }
    const center = pair(rec.center)
    if (typeof rec.id !== 'string' || !center) continue
    out.push({ id: rec.id, x: center[0], z: center[1] })
  }
  return out
}

export function orderAnchors(alert: AnchorPoint | null, demos: readonly AnchorPoint[]): AnchorPoint[] {
  const list: AnchorPoint[] = []
  if (alert) list.push(alert)
  for (const demo of demos) {
    if (list.length >= STICKER_CAP) break
    if (list.some((item) => Math.hypot(item.x - demo.x, item.z - demo.z) < 0.75)) continue
    list.push(demo)
  }
  return list.slice(0, STICKER_CAP)
}

interface Hit {
  kind: string
  x: number
  z: number
  dist: number
  rotY: number
}

export function nearestWall(x: number, z: number, walls: readonly WallSeg[]): Hit | null {
  let best: Hit | null = null
  for (const wall of walls) {
    const hit = project(x, z, wall)
    if (!hit) continue
    if (hit.dist > MAX_WALL_M) continue
    if (!best || hit.dist < best.dist) best = hit
  }
  return best
}

export function buildStickers(input: {
  anchors: readonly AnchorPoint[]
  walls: readonly WallSeg[]
  elevation: number
  lift?: number
  batchedBlocked?: boolean
}): StickerView[] {
  const y = stickerWorldY(input.elevation, input.lift ?? 0)
  const batchedBlocked = input.batchedBlocked === true
  const drafts: Array<Omit<StickerView, 'mode'>> = []
  for (const anchor of input.anchors) {
    if (drafts.length >= STICKER_CAP) break
    const hit = nearestWall(anchor.x, anchor.z, input.walls)
    if (!hit) continue
    const sceneKind = sceneKindForWall(hit.kind, batchedBlocked)
    const receiver = receiverForScene(sceneKind)
    // 单层机位在百米外。贴图要盖住一段墙面，俯视才看得见。
    const size = anchor.role === 'alert' ? 1.7 : 1.35
    const texture = assertLocalDecalUrl(anchor.role === 'alert' ? ALERT_TEXTURE : DEMO_TEXTURE)
    drafts.push({
      id: anchor.id,
      role: anchor.role,
      receiver,
      sceneKind,
      x: hit.x,
      y,
      z: hit.z,
      rotY: hit.rotY,
      width: size,
      height: size,
      texture,
    })
  }
  let decals = 0
  return drafts.map((draft) => {
    const mode = acceptsDecalReceiver(draft.receiver) && decals < DECAL_MESH_CAP ? 'decal' : 'image'
    if (mode === 'decal') decals += 1
    return { ...draft, mode }
  })
}

function pair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const x = value[0]
  const z = value[1]
  if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) return null
  return [x, z]
}

function project(px: number, pz: number, wall: WallSeg): Hit | null {
  const abx = wall.b[0] - wall.a[0]
  const abz = wall.b[1] - wall.a[1]
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-8) return null
  let t = ((px - wall.a[0]) * abx + (pz - wall.a[1]) * abz) / len2
  t = Math.min(1, Math.max(0, t))
  const x = wall.a[0] + abx * t
  const z = wall.a[1] + abz * t
  const len = Math.sqrt(len2)
  let nx = -abz / len
  let nz = abx / len
  const vx = px - x
  const vz = pz - z
  if (nx * vx + nz * vz < 0) {
    nx = -nx
    nz = -nz
  }
  return {
    kind: wall.kind,
    x: x + nx * WALL_GAP_M,
    z: z + nz * WALL_GAP_M,
    dist: Math.hypot(vx, vz),
    rotY: Math.atan2(nx, nz),
  }
}
