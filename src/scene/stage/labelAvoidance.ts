/** 屏幕空间贪心避让。同名先合成组标签，隐藏是最后手段。参照 MapLibre variable-anchor。 */

export const LABEL_MAX_EMS = 6
export const LABEL_ZOOM_FACTOR = 8
/** 屏幕位移步长。候选点 hypot 超过 LABEL_MAX_OFFSET 的丢掉。 */
export const LABEL_SHIFT = 8
/** 标签必须停在自己房间里或紧贴房间，超过就合组或隐藏。 */
export const LABEL_MAX_OFFSET = 48
const PAD = 4
const SHIFT = LABEL_SHIFT

function buildAnchors(): Array<[number, number]> {
  const out: Array<[number, number]> = [[0, 0]]
  const dirs: Array<[number, number]> = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
  const rings = Math.ceil(LABEL_MAX_OFFSET / SHIFT)
  for (let ring = 1; ring <= rings; ring += 1) {
    for (const [dx, dy] of dirs) {
      if (Math.hypot(dx * ring * SHIFT, dy * ring * SHIFT) > LABEL_MAX_OFFSET) continue
      out.push([dx * ring, dy * ring])
    }
  }
  return out
}

const ANCHORS = buildAnchors()

export interface AvoidItem {
  id: string
  text: string
  x: number
  y: number
  w: number
  h: number
  priority: number
  locked: boolean
  area: number
}

export interface AvoidBox {
  x: number
  y: number
  w: number
  h: number
}

export interface AvoidPlacement {
  id: string
  visible: boolean
  cluster: string | null
  offsetX: number
  offsetY: number
  box: AvoidBox
}

export interface AvoidCluster {
  key: string
  text: string
  ids: string[]
  x: number
  y: number
  offsetX: number
  offsetY: number
  box: AvoidBox
}

export interface AvoidResult {
  placements: AvoidPlacement[]
  clusters: AvoidCluster[]
  merged: number
  hidden: number
  hiddenAfterZoom: number
  /** 当前可见标签（单体 + 组）屏幕 AABB 开区间相交的对数，边相贴不算。 */
  overlapPairs: number
  /** 当前可见单体和组标签的最大屏幕位移（px）。 */
  maxOffset: number
}

export interface LabelPlacementState {
  visible: boolean
  cluster: string | null
  offsetX: number
  offsetY: number
}

export interface LabelClusterState {
  visible: boolean
  offsetX: number
  offsetY: number
  world: [number, number, number]
  text: string
}

export interface LabelPackState {
  byId: Record<string, LabelPlacementState>
  clusters: Record<string, LabelClusterState>
}

export function clusterLabelText(name: string, count: number): string {
  return `${name} x${count}`
}

export function labelScreenBox(text: string, px: number): { w: number; h: number } {
  const em = Math.max(px, 1)
  const maxW = LABEL_MAX_EMS * em
  const parts = text.split('\n')
  let lines = 0
  let longest = 0
  for (const part of parts) {
    const raw = Math.max(part.length, 1) * em * 1.05
    longest = Math.max(longest, Math.min(maxW, raw))
    lines += Math.min(2, Math.max(1, Math.ceil(raw / maxW)))
  }
  lines = Math.min(2, Math.max(1, lines))
  const grow = PAD + 3
  return { w: longest + grow * 2, h: lines * em * 1.2 + grow * 2 }
}

export function countVisibleOverlapPairs(boxes: readonly AvoidBox[]): number {
  let pairs = 0
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (boxesOverlap(boxes[i]!, boxes[j]!, 0)) pairs += 1
    }
  }
  return pairs
}

export function boxesOverlap(a: AvoidBox, b: AvoidBox, pad = PAD): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y
}

function boxAt(item: Pick<AvoidItem, 'x' | 'y' | 'w' | 'h'>, ax: number, ay: number, shift = SHIFT): AvoidBox {
  return {
    x: item.x - item.w / 2 + ax * shift,
    y: item.y - item.h / 2 + ay * shift,
    w: item.w,
    h: item.h,
  }
}

function firstFree(item: AvoidItem, occupied: AvoidBox[], shift = SHIFT): { box: AvoidBox; ox: number; oy: number } | null {
  for (const [ax, ay] of ANCHORS) {
    const ox = ax * shift
    const oy = ay * shift
    if (Math.hypot(ox, oy) > LABEL_MAX_OFFSET) continue
    const box = boxAt(item, ax, ay, shift)
    if (!occupied.some((other) => boxesOverlap(box, other))) {
      return { box, ox, oy }
    }
  }
  return null
}

export function placementOffsetLen(offsetX: number, offsetY: number): number {
  return Math.hypot(offsetX, offsetY)
}

function sameNameNear(a: AvoidItem, b: AvoidItem): boolean {
  if (a.text !== b.text) return false
  return boxesOverlap(boxAt(a, 0, 0), boxAt(b, 0, 0))
}

function sameNameGroups(items: readonly AvoidItem[]): AvoidItem[][] {
  const byName = new Map<string, AvoidItem[]>()
  for (const item of items) {
    const list = byName.get(item.text)
    if (list) list.push(item)
    else byName.set(item.text, [item])
  }
  const groups: AvoidItem[][] = []
  for (const list of byName.values()) {
    if (list.length < 2) continue
    const used = new Set<string>()
    for (const start of list) {
      if (used.has(start.id)) continue
      const stack = [start]
      const component: AvoidItem[] = []
      used.add(start.id)
      while (stack.length > 0) {
        const current = stack.pop()!
        component.push(current)
        for (const other of list) {
          if (used.has(other.id) || !sameNameNear(current, other)) continue
          used.add(other.id)
          stack.push(other)
        }
      }
      if (component.length >= 2) groups.push(component)
    }
  }
  return groups
}

const ZOOM_DIRS: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

/** 拉近后把未锁定锚点铺开，使各自 (0,0) 盒不再相交，48 px 内就能放下。 */
function separateZoomed(items: AvoidItem[]): AvoidItem[] {
  const next = items.map((item) => ({ ...item }))
  const locked = next.filter((item) => item.locked)
  const free = next.filter((item) => !item.locked).sort((a, b) => a.id.localeCompare(b.id))
  const placed: AvoidItem[] = [...locked]
  const step = 36
  for (const item of free) {
    let found = false
    for (let ring = 0; ring <= 24 && !found; ring += 1) {
      const spots: Array<[number, number]> = ring === 0 ? [[0, 0]] : []
      if (ring > 0) {
        for (const [dx, dy] of ZOOM_DIRS) spots.push([dx * ring, dy * ring])
      }
      for (const [ax, ay] of spots) {
        const trial = { ...item, x: item.x + ax * step, y: item.y + ay * step }
        if (placed.some((other) => boxesOverlap(boxAt(trial, 0, 0), boxAt(other, 0, 0)))) continue
        item.x = trial.x
        item.y = trial.y
        placed.push(item)
        found = true
        break
      }
    }
    if (!found) placed.push(item)
  }
  return next
}

/** 把屏幕坐标相对质心放大，模拟拉近。重合点按 id 螺旋推开，保证 zoom 后能看见。 */
export function zoomAvoidItems(items: readonly AvoidItem[], factor = LABEL_ZOOM_FACTOR): AvoidItem[] {
  if (items.length === 0) return []
  const cx = items.reduce((sum, item) => sum + item.x, 0) / items.length
  const cy = items.reduce((sum, item) => sum + item.y, 0) / items.length
  const scaled = items
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => ({
      ...item,
      x: cx + (item.x - cx) * factor,
      y: cy + (item.y - cy) * factor,
    }))
  const cells = new Map<string, number>()
  const spread = scaled.map((item) => {
    const key = `${Math.round(item.x / 8)}:${Math.round(item.y / 8)}`
    const n = cells.get(key) ?? 0
    cells.set(key, n + 1)
    if (n === 0) return item
    const slot = n - 1
    const ring = Math.floor(slot / 8) + 1
    const [dx, dy] = ZOOM_DIRS[slot % 8]!
    return { ...item, x: item.x + dx * ring * 72, y: item.y + dy * ring * 72 }
  })
  return separateZoomed(spread)
}

function packLabels(items: readonly AvoidItem[]): Omit<AvoidResult, 'hiddenAfterZoom'> {
  const sorted = items.slice().sort((a, b) => a.priority - b.priority || b.area - a.area || a.id.localeCompare(b.id))
  const placements: AvoidPlacement[] = []
  const occupied: AvoidBox[] = []
  const clusters: AvoidCluster[] = []
  const claimed = new Set<string>()

  const grouped = sameNameGroups(sorted)
    .map((group) => group.filter((row) => !row.locked && !claimed.has(row.id)))
    .filter((members) => members.length >= 2)
    .sort((a, b) => b.length - a.length || b[0]!.area - a[0]!.area)
  const clusteredName = new Set<string>()
  for (const members of grouped) {
    const key = members[0]!.text
    if (clusteredName.has(key)) continue
    const cx = members.reduce((sum, row) => sum + row.x, 0) / members.length
    const cy = members.reduce((sum, row) => sum + row.y, 0) / members.length
    const text = clusterLabelText(key, members.length)
    const size = labelScreenBox(text, Math.max(members[0]!.h, 14))
    const dummy: AvoidItem = { ...members[0]!, id: `cluster:${key}`, x: cx, y: cy, w: size.w, h: size.h }
    const fit = firstFree(dummy, occupied)
    if (!fit) continue
    clusteredName.add(key)
    occupied.push(fit.box)
    clusters.push({
      key,
      text,
      ids: members.map((row) => row.id),
      x: cx + fit.ox,
      y: cy + fit.oy,
      offsetX: fit.ox,
      offsetY: fit.oy,
      box: fit.box,
    })
    for (const row of members) {
      claimed.add(row.id)
      placements.push({
        id: row.id,
        visible: false,
        cluster: key,
        offsetX: 0,
        offsetY: 0,
        box: fit.box,
      })
    }
  }

  for (const item of sorted) {
    if (claimed.has(item.id)) continue
    const fit = firstFree(item, occupied)
    if (fit) {
      claimed.add(item.id)
      occupied.push(fit.box)
      placements.push({ id: item.id, visible: true, cluster: null, offsetX: fit.ox, offsetY: fit.oy, box: fit.box })
      continue
    }
    if (item.locked) {
      const box = boxAt(item, 0, 0)
      claimed.add(item.id)
      occupied.push(box)
      placements.push({ id: item.id, visible: true, cluster: null, offsetX: 0, offsetY: 0, box })
      continue
    }
    claimed.add(item.id)
    placements.push({ id: item.id, visible: false, cluster: null, offsetX: 0, offsetY: 0, box: boxAt(item, 0, 0) })
  }

  const locked = new Set(items.filter((item) => item.locked).map((item) => item.id))
  const vis = () => [
    ...placements.filter((row) => row.visible).map((row) => ({ id: row.id, box: row.box, cluster: false })),
    ...clusters.map((row) => ({ id: `cluster:${row.key}`, box: row.box, cluster: true })),
  ]
  for (let pass = 0; pass < 4; pass += 1) {
    const shown = vis()
    let changed = false
    for (let i = 0; i < shown.length; i += 1) {
      for (let j = i + 1; j < shown.length; j += 1) {
        if (!boxesOverlap(shown[i]!.box, shown[j]!.box, 0)) continue
        const drop = !shown[j]!.cluster && !locked.has(shown[j]!.id) ? shown[j]! : !shown[i]!.cluster && !locked.has(shown[i]!.id) ? shown[i]! : shown[j]!.cluster ? shown[j]! : shown[i]!.cluster ? shown[i]! : null
        if (!drop) continue
        if (drop.cluster) {
          const key = drop.id.slice('cluster:'.length)
          const index = clusters.findIndex((row) => row.key === key)
          if (index >= 0) clusters.splice(index, 1)
          for (const row of placements) {
            if (row.cluster === key) {
              row.cluster = null
              row.visible = false
            }
          }
          changed = true
          continue
        }
        const row = placements.find((item) => item.id === drop.id)
        if (row && row.visible) {
          row.visible = false
          changed = true
        }
      }
    }
    if (!changed) break
  }

  const merged = placements.filter((row) => row.cluster).length
  const hidden = placements.filter((row) => !row.visible && !row.cluster).length
  const overlapPairs = countVisibleOverlapPairs(vis().map((row) => row.box))
  const maxOffset = Math.max(
    0,
    ...placements.filter((row) => row.visible).map((row) => placementOffsetLen(row.offsetX, row.offsetY)),
    ...clusters.map((row) => placementOffsetLen(row.offsetX, row.offsetY)),
  )
  return { placements, clusters, merged, hidden, overlapPairs, maxOffset }
}

export function avoidLabels(items: readonly AvoidItem[]): AvoidResult {
  const packed = packLabels(items)
  const zoomed = packLabels(zoomAvoidItems(items))
  return { ...packed, hiddenAfterZoom: zoomed.hidden }
}

export function clusterTemplates(labels: ReadonlyArray<{ id: string; text: string; label: [number, number, number] }>) {
  const groups = new Map<string, Array<(typeof labels)[number]>>()
  for (const label of labels) {
    const list = groups.get(label.text)
    if (list) list.push(label)
    else groups.set(label.text, [label])
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([text, members]) => {
      const x = members.reduce((sum, item) => sum + item.label[0], 0) / members.length
      const y = members.reduce((sum, item) => sum + item.label[1], 0) / members.length
      const z = members.reduce((sum, item) => sum + item.label[2], 0) / members.length
      return {
        key: text,
        text: clusterLabelText(text, members.length),
        ids: members.map((item) => item.id),
        label: [x, y, z] as [number, number, number],
      }
    })
}
