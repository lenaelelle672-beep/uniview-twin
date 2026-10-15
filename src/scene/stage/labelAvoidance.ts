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
  /** 楼层数据分级：2 主要房间，3 小房间/辅助用房。第一级只用 locked。 */
  tier?: 2 | 3
  /** 组标签若已有 troika 实测盒，优先用它。 */
  clusterBox?: { w: number; h: number }
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
  /** 进层/层级/拖动结束时算好的本地坐标，拖动中不再重投。 */
  local?: [number, number, number]
}

export interface LabelClusterState {
  visible: boolean
  offsetX: number
  offsetY: number
  world: [number, number, number]
  local?: [number, number, number]
  text: string
}

export interface LabelPackState {
  byId: Record<string, LabelPlacementState>
  clusters: Record<string, LabelClusterState>
}

export function clusterLabelText(name: string, count: number): string {
  return `${name} x${count}`
}

function wrapMetrics(text: string, em: number): { longest: number; lines: number } {
  const maxW = LABEL_MAX_EMS * em
  const parts = text.split('\n')
  let lines = 0
  let longest = 0
  for (const part of parts) {
    const raw = Math.max(part.length, 1) * em * 1.12
    longest = Math.max(longest, Math.min(maxW, raw))
    lines += Math.min(2, Math.max(1, Math.ceil(raw / maxW)))
  }
  return { longest, lines: Math.min(2, Math.max(1, lines)) }
}

export function labelScreenBox(text: string, px: number): { w: number; h: number } {
  const em = Math.max(px, 1)
  const { longest, lines } = wrapMetrics(text, em)
  const outline = Math.max(0.5, em * 0.055)
  const grow = PAD + 3 + outline
  return { w: longest + grow * 2, h: lines * em * 1.25 + grow * 2 }
}

/** 与 troika 成员网格一致：XY 平面、居中锚点，含描边。单位与 fontSize 相同。 */
export function labelWorldSize(text: string, fontSize: number, outlineWidth = 0): { w: number; h: number } {
  const em = Math.max(fontSize, 1e-4)
  const { longest, lines } = wrapMetrics(text, em)
  return { w: longest + outlineWidth * 2, h: lines * em * 1.25 + outlineWidth * 2 }
}

export function itemTier(item: Pick<AvoidItem, 'tier' | 'priority' | 'locked'>): 2 | 3 {
  if (item.tier === 2 || item.tier === 3) return item.tier
  return item.priority <= 2 && !item.locked ? 2 : 3
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
  if (factor >= LABEL_ZOOM_FACTOR) return separateZoomed(spread)
  return spread
}

function dropScore(
  entry: { id: string; cluster: boolean },
  locked: Set<string>,
  byId: Map<string, AvoidItem>,
  placements: AvoidPlacement[],
  keepTier2: boolean,
): number {
  if (!entry.cluster && locked.has(entry.id)) return -100
  if (entry.cluster) {
    const key = entry.id.slice('cluster:'.length)
    const members = placements.filter((row) => row.cluster === key)
    if (keepTier2 && members.some((row) => itemTier(byId.get(row.id) ?? { priority: 3, locked: false }) === 2)) return -50
    const prios = members.map((row) => byId.get(row.id)?.priority ?? itemTier(byId.get(row.id) ?? { priority: 3, locked: false }))
    return Math.max(20, ...prios.map((prio) => (prio <= 1 ? 1 : prio === 2 ? 21 : 31)))
  }
  const item = byId.get(entry.id)
  if (!item) return 30
  if (item.locked) return -100
  if (itemTier(item) === 2) return keepTier2 ? -50 : 20
  return 30
}

/** 合组已上屏时，把叠在合组盒上的同名单体收进组里，避免「会议室」和「会议室 xN」叠字。 */
function absorbOverlappingSameName(
  placements: AvoidPlacement[],
  clusters: AvoidCluster[],
  byId: Map<string, AvoidItem>,
): void {
  for (const cluster of clusters) {
    for (const row of placements) {
      if (!row.visible) continue
      const item = byId.get(row.id)
      if (!item || item.text !== cluster.key) continue
      if (!boxesOverlap(row.box, cluster.box, 0)) continue
      row.visible = false
      row.cluster = cluster.key
      if (!cluster.ids.includes(row.id)) cluster.ids.push(row.id)
    }
  }
}

function packLabels(items: readonly AvoidItem[], keepTier2 = false): Omit<AvoidResult, 'hiddenAfterZoom'> {
  const byId = new Map(items.map((item) => [item.id, item]))
  const placements: AvoidPlacement[] = []
  const occupied: AvoidBox[] = []
  const clusters: AvoidCluster[] = []
  const claimed = new Set<string>()

  const placeClusters = (candidates: AvoidItem[], force = false) => {
    const grouped = sameNameGroups(candidates)
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
      const em = Math.max(14, Math.min(members[0]!.h, members[0]!.w / Math.max(members[0]!.text.length, 1)))
      const size = members[0]!.clusterBox ?? labelScreenBox(text, em)
      const dummy: AvoidItem = { ...members[0]!, id: `cluster:${key}`, x: cx, y: cy, w: size.w, h: size.h }
      const fit = firstFree(dummy, occupied) ?? (force ? { box: boxAt(dummy, 0, 0), ox: 0, oy: 0 } : null)
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
  }

  const placeItems = (candidates: AvoidItem[], keep: boolean) => {
    const sorted = candidates
      .slice()
      .sort((a, b) => a.priority - b.priority || b.area - a.area || a.id.localeCompare(b.id))
    for (const item of sorted) {
      if (claimed.has(item.id)) continue
      const fit = firstFree(item, occupied)
      if (fit) {
        claimed.add(item.id)
        occupied.push(fit.box)
        placements.push({ id: item.id, visible: true, cluster: null, offsetX: fit.ox, offsetY: fit.oy, box: fit.box })
        continue
      }
      if (keep || item.locked) {
        const box = boxAt(item, 0, 0)
        claimed.add(item.id)
        occupied.push(box)
        placements.push({ id: item.id, visible: true, cluster: null, offsetX: 0, offsetY: 0, box })
        continue
      }
      claimed.add(item.id)
      placements.push({ id: item.id, visible: false, cluster: null, offsetX: 0, offsetY: 0, box: boxAt(item, 0, 0) })
    }
  }

  const lockedItems = items.filter((item) => item.locked)
  const major = items.filter((item) => !item.locked && itemTier(item) === 2)
  const minor = items.filter((item) => !item.locked && itemTier(item) !== 2)
  placeItems(lockedItems, true)
  placeClusters(major, keepTier2)
  placeItems(major, keepTier2)
  placeClusters(minor)
  placeItems(minor, false)

  const locked = new Set(items.filter((item) => item.locked).map((item) => item.id))
  const vis = () => [
    ...placements.filter((row) => row.visible).map((row) => ({ id: row.id, box: row.box, cluster: false })),
    ...clusters.map((row) => ({ id: `cluster:${row.key}`, box: row.box, cluster: true })),
  ]
  const sweep = () => {
    for (let pass = 0; pass < 8; pass += 1) {
      const shown = vis()
      let changed = false
      let worst: { entry: (typeof shown)[number]; score: number } | null = null
      for (let i = 0; i < shown.length; i += 1) {
        for (let j = i + 1; j < shown.length; j += 1) {
          if (!boxesOverlap(shown[i]!.box, shown[j]!.box, 0)) continue
          const left = { id: shown[i]!.id, cluster: shown[i]!.cluster, score: dropScore(shown[i]!, locked, byId, placements, keepTier2) }
          const right = { id: shown[j]!.id, cluster: shown[j]!.cluster, score: dropScore(shown[j]!, locked, byId, placements, keepTier2) }
          const pick = left.score >= right.score ? left : right
          if (pick.score < 0) continue
          if (!worst || pick.score > worst.score) worst = { entry: pick.score === left.score ? shown[i]! : shown[j]!, score: pick.score }
        }
      }
      if (!worst) break
      const drop = worst.entry
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
      } else {
        const row = placements.find((item) => item.id === drop.id)
        if (row && row.visible) {
          row.visible = false
          changed = true
        }
      }
      if (!changed) break
    }
  }
  sweep()

  if (keepTier2) {
    const liveKeys = new Set(clusters.map((row) => row.key))
    for (const item of items) {
      if (itemTier(item) !== 2) continue
      const row = placements.find((place) => place.id === item.id)
      if (!row || row.visible) continue
      if (row.cluster && liveKeys.has(row.cluster)) continue
      const same = clusters.find((cluster) => cluster.key === item.text)
      if (same && boxesOverlap(boxAt(item, 0, 0), same.box, 0)) {
        row.visible = false
        row.cluster = item.text
        if (!same.ids.includes(item.id)) same.ids.push(item.id)
        continue
      }
      row.visible = true
      row.cluster = null
      row.offsetX = 0
      row.offsetY = 0
      row.box = boxAt(item, 0, 0)
    }
  }

  absorbOverlappingSameName(placements, clusters, byId)
  sweep()

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

export function avoidLabels(
  items: readonly AvoidItem[],
  clusterSizes?: Record<string, { w: number; h: number }>,
  keepTier2 = false,
): AvoidResult {
  if (clusterSizes) {
    for (const item of items) {
      const size = clusterSizes[item.text]
      if (size) item.clusterBox = size
    }
  }
  const packed = packLabels(items, keepTier2)
  const zoomed = packLabels(zoomAvoidItems(items), keepTier2)
  return { ...packed, hiddenAfterZoom: zoomed.hidden }
}

export function tier2Stats(items: readonly AvoidItem[], result: Pick<AvoidResult, 'placements'>): { visible: number; total: number; hidden: number } {
  let visible = 0
  let total = 0
  let hidden = 0
  const byId = new Map(result.placements.map((row) => [row.id, row]))
  for (const item of items) {
    if (itemTier(item) !== 2) continue
    total += 1
    const row = byId.get(item.id)
    if (row && (row.visible || row.cluster)) visible += 1
    else hidden += 1
  }
  return { visible, total, hidden }
}

export const LABEL_ZOOM_STEPS = [
  { name: 'default' as const, factor: 1 },
  { name: 'mid' as const, factor: 2.4 },
  { name: 'close' as const, factor: LABEL_ZOOM_FACTOR },
]

export function zoomVisibilityLadder(items: readonly AvoidItem[]) {
  return LABEL_ZOOM_STEPS.map((step) => {
    const packed = step.factor === 1 ? packLabels(items) : packLabels(zoomAvoidItems(items, step.factor))
    const shown = packed.placements.filter((row) => row.visible).length + packed.clusters.length
    const tier = tier2Stats(items, packed)
    return {
      name: step.name,
      factor: step.factor,
      visibleLabels: shown,
      hidden: packed.hidden,
      tier2Visible: tier.visible,
      tier2Total: tier.total,
    }
  })
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
