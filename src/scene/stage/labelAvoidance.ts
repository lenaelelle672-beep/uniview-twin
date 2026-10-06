/** 屏幕空间贪心避让。参照 MapLibre symbol-sort-key / variable-anchor / padding，约 60 行。 */

export const LABEL_MAX_EMS = 6
const PAD = 2
const SHIFT = 10
const ANCHORS: Array<[number, number]> = [
  [0, 0],
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, -2],
  [0, 2],
  [-2, 0],
  [2, 0],
]

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
  box: AvoidBox
}

export interface AvoidResult {
  placements: AvoidPlacement[]
  clusters: AvoidCluster[]
  hidden: number
  overlapPairs: number
}

export interface LabelPlacementState {
  visible: boolean
  cluster: string | null
  offsetX: number
  offsetY: number
}

export interface LabelPackState {
  byId: Record<string, LabelPlacementState>
  clusters: Record<string, boolean>
}

export function labelScreenBox(text: string, px: number): { w: number; h: number } {
  const em = Math.max(px, 1)
  const maxW = LABEL_MAX_EMS * em
  const raw = Math.max(text.length, 1) * em * 0.98
  const w = Math.min(maxW, raw) + PAD * 2
  const lines = Math.min(2, Math.max(1, Math.ceil(raw / maxW)))
  return { w, h: lines * em * 1.2 + PAD * 2 }
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
    const box = boxAt(item, ax, ay, shift)
    if (!occupied.some((other) => boxesOverlap(box, other))) {
      return { box, ox: ax * shift, oy: ay * shift }
    }
  }
  return null
}

export function avoidLabels(items: readonly AvoidItem[]): AvoidResult {
  const sorted = items.slice().sort((a, b) => a.priority - b.priority || b.area - a.area || a.id.localeCompare(b.id))
  const placements: AvoidPlacement[] = []
  const occupied: Array<{ id: string; box: AvoidBox }> = []
  const clusters: AvoidCluster[] = []
  const claimed = new Set<string>()

  for (const item of sorted) {
    if (claimed.has(item.id)) continue
    const fit = firstFree(
      item,
      occupied.map((row) => row.box),
    )
    if (fit) {
      claimed.add(item.id)
      occupied.push({ id: item.id, box: fit.box })
      placements.push({ id: item.id, visible: true, cluster: null, offsetX: fit.ox, offsetY: fit.oy, box: fit.box })
      continue
    }

    const mates = sorted.filter(
      (other) => other.id !== item.id && other.text === item.text && boxesOverlap(boxAt(item, 0, 0), boxAt(other, 0, 0)),
    )
    if (mates.length > 0) {
      const group = [item, ...mates.filter((row) => !claimed.has(row.id) || placements.some((p) => p.id === row.id && !p.cluster))]
      for (const row of group) {
        const index = occupied.findIndex((entry) => entry.id === row.id)
        if (index >= 0) occupied.splice(index, 1)
        const existing = placements.findIndex((entry) => entry.id === row.id)
        if (existing >= 0) placements.splice(existing, 1)
      }
      const cx = group.reduce((sum, row) => sum + row.x, 0) / group.length
      const cy = group.reduce((sum, row) => sum + row.y, 0) / group.length
      const size = labelScreenBox(`${item.text} ×${group.length}`, Math.max(item.h, 14))
      const dummy: AvoidItem = { ...item, id: `cluster:${item.text}`, x: cx, y: cy, w: size.w, h: size.h }
      const clusterFit =
        firstFree(
          dummy,
          occupied.map((row) => row.box),
        ) ?? { box: boxAt(dummy, 0, 0), ox: 0, oy: 0 }
      occupied.push({ id: `cluster:${item.text}`, box: clusterFit.box })
      const key = item.text
      clusters.push({
        key,
        text: `${item.text} ×${group.length}`,
        ids: group.map((row) => row.id),
        x: cx + clusterFit.ox,
        y: cy + clusterFit.oy,
        box: clusterFit.box,
      })
      for (const row of group) {
        claimed.add(row.id)
        placements.push({
          id: row.id,
          visible: false,
          cluster: key,
          offsetX: 0,
          offsetY: 0,
          box: clusterFit.box,
        })
      }
      continue
    }

    if (item.locked) {
      const box = boxAt(item, 0, 0)
      claimed.add(item.id)
      occupied.push({ id: item.id, box })
      placements.push({ id: item.id, visible: true, cluster: null, offsetX: 0, offsetY: 0, box })
      continue
    }

    claimed.add(item.id)
    placements.push({ id: item.id, visible: false, cluster: null, offsetX: 0, offsetY: 0, box: boxAt(item, 0, 0) })
  }

  const visibleBoxes = [
    ...placements.filter((row) => row.visible).map((row) => row.box),
    ...clusters.map((row) => row.box),
  ]
  let overlapPairs = 0
  for (let i = 0; i < visibleBoxes.length; i += 1) {
    for (let j = i + 1; j < visibleBoxes.length; j += 1) {
      if (boxesOverlap(visibleBoxes[i], visibleBoxes[j], 0)) overlapPairs += 1
    }
  }

  return {
    placements,
    clusters,
    hidden: placements.filter((row) => !row.visible && !row.cluster).length,
    overlapPairs,
  }
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
        text: `${text} ×${members.length}`,
        ids: members.map((item) => item.id),
        label: [x, y, z] as [number, number, number],
      }
    })
}
