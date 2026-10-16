import { Matrix4, Vector3, type Camera, type Object3D } from 'three'
import { type AvoidBox, type LabelPackState } from './labelAvoidance'

/** 两向都大于此值才算重叠；擦边只计数。 */
export const OVERLAP_STRONG_PX = 2
/**
 * 一条轴已经叠进对方大半、另一条轴仍贴着的长条。
 * 不计入 overlapPairs，但清叠时和强重叠走同一套优先级：同名合组，其次藏第三级。
 */
export const OVERLAP_SLAB_PX = 8

const world = new Matrix4()
const local = new Matrix4()
const inv = new Matrix4()
const corner = new Vector3()
const look = new Vector3()
const one = new Vector3(1, 1, 1)

export interface MeasuredLabelBox {
  id: string
  text: string
  box: AvoidBox
  cluster: string | null
  px: number
}

export function isDrawnText(text: { visible?: boolean; scale: { x: number }; fillOpacity?: number; opacity?: number }): boolean {
  if (text.visible === false) return false
  const fade = text.fillOpacity ?? text.opacity ?? 1
  return text.scale.x > 0.05 && fade > 0
}

/** 指针落在谁的屏上盒里：取中心最近、盒子更小者。不按数组顺序、不优先“第一个隐藏项”。 */
export function pickHoverLabel(
  pointer: { x: number; y: number },
  items: ReadonlyArray<{ id: string; x: number; y: number; w: number; h: number }>,
  pad = 4,
): string | null {
  let best: { id: string; dist: number; area: number } | null = null
  for (const item of items) {
    const halfW = item.w / 2 + pad
    const halfH = item.h / 2 + pad
    if (pointer.x < item.x - halfW || pointer.x > item.x + halfW) continue
    if (pointer.y < item.y - halfH || pointer.y > item.y + halfH) continue
    const dist = Math.hypot(pointer.x - item.x, pointer.y - item.y)
    const area = Math.max(1, item.w * item.h)
    if (!best || dist < best.dist - 0.25 || (Math.abs(dist - best.dist) <= 0.25 && area < best.area)) {
      best = { id: item.id, dist, area }
    }
  }
  return best?.id ?? null
}

export function projectBlockBounds(
  blockBounds: readonly number[],
  batchWorld: Matrix4,
  localMatrix: Matrix4,
  camera: Camera,
  viewport: { width: number; height: number },
): AvoidBox | null {
  if (blockBounds.length < 4) return null
  world.multiplyMatrices(batchWorld, localMatrix)
  const x0 = blockBounds[0]!
  const y0 = blockBounds[1]!
  const x1 = blockBounds[2]!
  const y1 = blockBounds[3]!
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const pts: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]
  for (const [lx, ly] of pts) {
    corner.set(lx, ly, 0).applyMatrix4(world)
    corner.project(camera)
    if (!Number.isFinite(corner.x) || corner.z > 1) return null
    const sx = (corner.x * 0.5 + 0.5) * viewport.width
    const sy = (-corner.y * 0.5 + 0.5) * viewport.height
    minX = Math.min(minX, sx)
    maxX = Math.max(maxX, sx)
    minY = Math.min(minY, sy)
    maxY = Math.max(maxY, sy)
  }
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) }
}

export function localAt(position: { x: number; y: number; z: number }, quaternion: { x: number; y: number; z: number; w: number }): Matrix4 {
  return local.compose(position as Vector3, quaternion as never, one)
}

export function measureTextBox(
  text: {
    textRenderInfo?: { blockBounds?: number[] } | null
    position: { x: number; y: number; z: number }
    quaternion: { x: number; y: number; z: number; w: number }
    matrix: Matrix4
  },
  batchWorld: Matrix4,
  camera: Camera,
  viewport: { width: number; height: number },
  useLiveMatrix: boolean,
): AvoidBox | null {
  const bounds = text.textRenderInfo?.blockBounds
  if (!bounds) return null
  return projectBlockBounds(bounds, batchWorld, useLiveMatrix ? text.matrix : localAt(text.position, text.quaternion), camera, viewport)
}

export function overlapDepth(a: AvoidBox, b: AvoidBox): { ox: number; oy: number } {
  return {
    ox: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    oy: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
  }
}

export function countOverlapKinds(boxes: readonly AvoidBox[]): { strong: number; graze: number } {
  let strong = 0
  let graze = 0
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const { ox, oy } = overlapDepth(boxes[i]!, boxes[j]!)
      if (ox <= 0 || oy <= 0) continue
      if (ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX) strong += 1
      else graze += 1
    }
  }
  return { strong, graze }
}

export function countMeasuredOverlap(boxes: readonly AvoidBox[]): number {
  return countOverlapKinds(boxes).strong
}

export function overlapPairNames(
  items: ReadonlyArray<{ text: string; box: AvoidBox }>,
  strongOnly = true,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const { ox, oy } = overlapDepth(items[i]!.box, items[j]!.box)
      if (ox <= 0 || oy <= 0) continue
      const strong = ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX
      if (strongOnly && !strong) continue
      if (!strongOnly && strong) continue
      pairs.push([items[i]!.text, items[j]!.text])
    }
  }
  return pairs
}

export function pickOverlapVictim(
  left: { id: string; text: string },
  right: { id: string; text: string },
  tierOf: (id: string) => number,
  keepTier2: boolean,
  isProtected: (id: string) => boolean = () => false,
): string {
  const score = (id: string) => {
    if (isProtected(id)) return -100
    const tier = tierOf(id)
    if (keepTier2 && tier === 2 && !id.startsWith('cluster:')) return -50
    if (id.startsWith('cluster:')) return 25
    return tier === 2 ? 20 : 30
  }
  return score(left.id) >= score(right.id) ? left.id : right.id
}

export function clusterBaseName(text: string): string {
  return text.replace(/ x\d+$/, '')
}

function hidePackEntry(pack: LabelPackState, id: string, cluster: string | null): void {
  if (id.startsWith('cluster:')) {
    const key = id.slice('cluster:'.length)
    if (pack.clusters[key]) pack.clusters[key] = { ...pack.clusters[key]!, visible: false }
    return
  }
  if (pack.byId[id]) pack.byId[id] = { ...pack.byId[id]!, visible: false, cluster }
}

function overlapActionable(ox: number, oy: number): boolean {
  if (ox <= 0 || oy <= 0) return false
  if (ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX) return true
  return Math.max(ox, oy) >= OVERLAP_SLAB_PX
}

export function hasActionableOverlap(boxes: readonly AvoidBox[]): boolean {
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const { ox, oy } = overlapDepth(boxes[i]!, boxes[j]!)
      if (overlapActionable(ox, oy)) return true
    }
  }
  return false
}

/** 按独立口径清掉强重叠，以及一条轴叠进对方、另一条轴仍贴着的长条。同名先合组；告警/选中/搜索不藏；1366+ 不藏第二级单体。 */
export function stripStrongOverlaps(
  live: readonly MeasuredLabelBox[],
  pack: LabelPackState,
  tierOf: (id: string) => number,
  keepTier2: boolean,
  isProtected: (id: string) => boolean = () => false,
): { pack: LabelPackState; remaining: MeasuredLabelBox[] } {
  const next: LabelPackState = {
    byId: { ...pack.byId },
    clusters: { ...pack.clusters },
  }
  let remaining = live.slice()
  for (let pass = 0; pass < 16; pass += 1) {
    let pending = false
    for (let i = 0; i < remaining.length && !pending; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const { ox, oy } = overlapDepth(remaining[i]!.box, remaining[j]!.box)
        if (overlapActionable(ox, oy)) {
          pending = true
          break
        }
      }
    }
    if (!pending) break
    let resolved = false
    pairLoop: for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const left = remaining[i]!
        const right = remaining[j]!
        const { ox, oy } = overlapDepth(left.box, right.box)
        const strong = ox > OVERLAP_STRONG_PX && oy > OVERLAP_STRONG_PX
        const slab = !strong && overlapActionable(ox, oy)
        if (!strong && !slab) continue
        if (
          left.text === right.text &&
          !left.id.startsWith('cluster:') &&
          !right.id.startsWith('cluster:') &&
          !isProtected(left.id) &&
          !isProtected(right.id)
        ) {
          hidePackEntry(next, left.id, left.text)
          hidePackEntry(next, right.id, right.text)
          if (next.clusters[left.text]) next.clusters[left.text] = { ...next.clusters[left.text]!, visible: true }
          remaining = remaining.filter((row) => row.id !== left.id && row.id !== right.id)
          resolved = true
          break pairLoop
        }
        if (
          clusterBaseName(left.text) === clusterBaseName(right.text) &&
          left.id.startsWith('cluster:') !== right.id.startsWith('cluster:')
        ) {
          const single = left.id.startsWith('cluster:') ? right : left
          if (isProtected(single.id)) continue
          hidePackEntry(next, single.id, clusterBaseName(single.text))
          remaining = remaining.filter((row) => row.id !== single.id)
          resolved = true
          break pairLoop
        }
        const drop = pickOverlapVictim(left, right, tierOf, keepTier2, isProtected)
        if (isProtected(drop)) continue
        if (keepTier2 && !drop.startsWith('cluster:') && tierOf(drop) === 2) {
          const otherId = drop === left.id ? right.id : left.id
          if (!isProtected(otherId)) continue
        }
        // 长条只藏第三级单体。合组留给强重叠，避免 0.5px 贴边拆掉一整组。
        if (slab && (drop.startsWith('cluster:') || tierOf(drop) !== 3)) continue
        hidePackEntry(next, drop, null)
        remaining = remaining.filter((row) => row.id !== drop)
        resolved = true
        break pairLoop
      }
    }
    if (!resolved) break
  }
  return { pack: next, remaining }
}

export function visibilityMismatch(expected: ReadonlySet<string>, actual: ReadonlySet<string>): string[] {
  const extra = [...actual].filter((id) => !expected.has(id))
  const missing = [...expected].filter((id) => !actual.has(id))
  return [...extra, ...missing]
}

export function findRoomLabelBatch(root: Object3D | null | undefined): Object3D | null {
  if (!root) return null
  let found: Object3D | null = null
  root.traverse((object) => {
    if (object.name === 'RoomLabelBatchedText') found = object
  })
  return found
}

export function labelYawForCamera(lookX: number, lookZ: number): number {
  const len = Math.hypot(lookX, lookZ)
  if (len < 1e-8) return 0
  return Math.atan2(-lookX / len, -lookZ / len)
}

export function cameraLookYaw(camera: Camera, host: Object3D | null): number {
  look.set(0, 0, 0)
  camera.getWorldDirection(look)
  if (host) {
    host.updateWorldMatrix(true, false)
    look.transformDirection(inv.copy(host.matrixWorld).invert())
  }
  look.y = 0
  return labelYawForCamera(look.x, look.z)
}

export function baselineAngleDeg(
  blockBounds: readonly number[],
  batchWorld: Matrix4,
  localMatrix: Matrix4,
  camera: Camera,
  viewport: { width: number; height: number },
): number | null {
  if (blockBounds.length < 4) return null
  const midY = (blockBounds[1]! + blockBounds[3]!) / 2
  world.multiplyMatrices(batchWorld, localMatrix)
  corner.set(blockBounds[0]!, midY, 0).applyMatrix4(world).project(camera)
  const x0 = (corner.x * 0.5 + 0.5) * viewport.width
  const y0 = (-corner.y * 0.5 + 0.5) * viewport.height
  corner.set(blockBounds[2]!, midY, 0).applyMatrix4(world).project(camera)
  const x1 = (corner.x * 0.5 + 0.5) * viewport.width
  const y1 = (-corner.y * 0.5 + 0.5) * viewport.height
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null
  let deg = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
  while (deg > 90) deg -= 180
  while (deg < -90) deg += 180
  return deg
}
