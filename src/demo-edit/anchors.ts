/**
 * DEMO 摆点草稿。
 *
 * cameras-demo 从现有合成机位拷一份出来改。
 * alarms-demo 每层取前 4 个机位的平面坐标，当作合成告警落点。
 * 两边都不是设备台账。时间轴仍读工位，覆盖锥仍读原来的锚点表。
 * 导出的 JSON 才是这一次摆出来的 cameras-demo / alarms-demo。
 */
import { isFloorId } from '../data/floors'

/**
 * 种子抄自 cameras-demo 的槽位，但不 import 那个模块。
 * 再引用它会把楼层名单重新导出到 early index。
 */
const CAMERA_MOUNT_Y = 2.15
const HEADING_NORTH = 0
const HEADING_EAST = -Math.PI / 2
const HEADING_SOUTH = Math.PI
const HEADING_WEST = Math.PI / 2

const TOWER_SLOTS = [
  { x: -20.5, z: 3.2, heading: HEADING_EAST },
  { x: 18.4, z: -4.6, heading: HEADING_WEST },
  { x: -8.2, z: 11.4, heading: HEADING_NORTH },
  { x: 6.5, z: -11.2, heading: HEADING_SOUTH },
  { x: 21.2, z: 8.6, heading: Math.PI / 4 },
  { x: -14.8, z: -7.4, heading: (5 * Math.PI) / 4 },
] as const

const B1_SLOTS = [
  { x: 49.07, z: 12.97, heading: HEADING_WEST },
  { x: 62.4, z: 16.2, heading: HEADING_SOUTH },
  { x: 11.14, z: -1.2, heading: HEADING_SOUTH },
  { x: -20.5, z: 3.2, heading: HEADING_EAST },
  { x: -8.2, z: 11.4, heading: HEADING_NORTH },
  { x: 28.6, z: 7.2, heading: HEADING_WEST },
] as const

function anchorFloors(): string[] {
  const ids = ['B1']
  for (let level = 1; level <= 22; level += 1) ids.push(`F${level}`)
  return ids
}

function seedSlots(floorId: string): readonly { x: number; z: number; heading: number }[] {
  const slots = floorId === 'B1' ? B1_SLOTS : TOWER_SLOTS
  const level = floorId === 'B1' ? 1 : Number(floorId.slice(1))
  const count = Math.min(6, 4 + (Math.abs(level) % 3))
  return slots.slice(0, count)
}

export const ALARM_ANCHOR_COUNT = 4

/** 告警点比机位低，和覆盖锥尖错开。 */
export const ALARM_ANCHOR_Y = 1.05

export type AnchorCatalog = 'cameras-demo' | 'alarms-demo'
export type EditMode = 'translate' | 'rotate'

export interface AnchorDraft {
  catalog: AnchorCatalog
  id: string
  floorId: string
  x: number
  z: number
  /** 告警锚点没有朝向。 */
  heading: number | null
}

export interface AnchorSession {
  catalog: AnchorCatalog
  mode: EditMode
  selectedId: string | null
  revision: number
}

export function anchorMountY(catalog: AnchorCatalog): number {
  return catalog === 'cameras-demo' ? CAMERA_MOUNT_Y : ALARM_ANCHOR_Y
}

export function normalizeHeading(radians: number): number {
  if (!Number.isFinite(radians)) return 0
  const tau = Math.PI * 2
  let angle = radians % tau
  if (angle > Math.PI) angle -= tau
  else if (angle <= -Math.PI) angle += tau
  return angle
}

export function roundMeters(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export function roundHeading(radians: number): number {
  return Math.round(normalizeHeading(radians) * 10_000) / 10_000
}

function seedDrafts(): AnchorDraft[] {
  const cameras = anchorFloors().flatMap((floorId) =>
    seedSlots(floorId).map((anchor, index) => ({
      catalog: 'cameras-demo' as const,
      id: `DEMO-${floorId}-CAM${index + 1}`,
      floorId,
      x: anchor.x,
      z: anchor.z,
      heading: anchor.heading,
    })),
  )
  const alarms = anchorFloors().flatMap((floorId) =>
    seedSlots(floorId)
      .slice(0, ALARM_ANCHOR_COUNT)
      .map((anchor, index) => ({
        catalog: 'alarms-demo' as const,
        id: `DEMO-${floorId}-ALM${index + 1}`,
        floorId,
        x: anchor.x,
        z: anchor.z,
        heading: null,
      })),
  )
  return [...cameras, ...alarms]
}

let drafts: AnchorDraft[] | null = null
let session: AnchorSession = {
  catalog: 'cameras-demo',
  mode: 'translate',
  selectedId: null,
  revision: 0,
}
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function touch(next: Partial<AnchorSession>): void {
  session = { ...session, ...next, revision: session.revision + 1 }
  emit()
}

export function anchorDrafts(): AnchorDraft[] {
  drafts ??= seedDrafts()
  return drafts
}

export function getAnchorSession(): AnchorSession {
  return session
}

export function subscribeAnchorSession(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function anchorsOnFloor(floorId: string, catalog: AnchorCatalog): AnchorDraft[] {
  return anchorDrafts().filter((row) => row.floorId === floorId && row.catalog === catalog)
}

export function resolveSelectedId(floorId: string, catalog: AnchorCatalog, selectedId: string | null): string | null {
  const rows = anchorsOnFloor(floorId, catalog)
  if (selectedId && rows.some((row) => row.id === selectedId)) return selectedId
  return rows[0]?.id ?? null
}

export function setAnchorCatalog(catalog: AnchorCatalog): void {
  if (session.catalog === catalog && (catalog === 'cameras-demo' || session.mode === 'translate')) return
  touch({
    catalog,
    mode: catalog === 'alarms-demo' ? 'translate' : session.mode,
  })
}

export function setEditMode(mode: EditMode): void {
  if (session.catalog === 'alarms-demo' && mode === 'rotate') return
  if (session.mode === mode) return
  touch({ mode })
}

export function selectAnchor(id: string | null): void {
  if (session.selectedId === id) return
  touch({ selectedId: id })
}

export function commitAnchorDrag(
  id: string,
  x: number,
  z: number,
  rotationY: number,
  writeHeading: boolean,
): AnchorDraft | null {
  const row = anchorDrafts().find((item) => item.id === id)
  if (!row) return null
  const nextX = roundMeters(x)
  const nextZ = roundMeters(z)
  const nextHeading = writeHeading && row.heading != null ? roundHeading(rotationY) : row.heading
  if (row.x === nextX && row.z === nextZ && row.heading === nextHeading) return row
  row.x = nextX
  row.z = nextZ
  row.heading = nextHeading
  touch({})
  return row
}

export function addAnchor(floorId: string): AnchorDraft | null {
  if (!isFloorId(floorId)) return null
  const catalog = session.catalog
  const prefix = catalog === 'cameras-demo' ? 'CAM' : 'ALM'
  const rows = anchorDrafts()
  let index = rows.filter((row) => row.catalog === catalog && row.floorId === floorId).length + 1
  let id = `DEMO-${floorId}-${prefix}${index}`
  while (rows.some((row) => row.id === id)) {
    index += 1
    id = `DEMO-${floorId}-${prefix}${index}`
  }
  const previous = [...rows].reverse().find((row) => row.catalog === catalog && row.floorId === floorId)
  const draft: AnchorDraft = {
    catalog,
    id,
    floorId,
    x: roundMeters((previous?.x ?? 0) + 1.2),
    z: previous?.z ?? 0,
    heading: catalog === 'cameras-demo' ? (previous?.heading ?? 0) : null,
  }
  rows.push(draft)
  touch({ selectedId: id })
  return draft
}

function floorIndex(floorId: string): number {
  const index = anchorFloors().indexOf(floorId)
  return index < 0 ? 999 : index
}

function byFloorThenId(left: AnchorDraft, right: AnchorDraft): number {
  const floor = floorIndex(left.floorId) - floorIndex(right.floorId)
  if (floor !== 0) return floor
  return left.id.localeCompare(right.id, 'en', { numeric: true })
}

export function anchorTableJson(): string {
  const rows = anchorDrafts()
  const cameras = rows
    .filter((row) => row.catalog === 'cameras-demo')
    .sort(byFloorThenId)
    .map((row) => ({
      id: row.id,
      floorId: row.floorId,
      x: row.x,
      z: row.z,
      heading: row.heading ?? 0,
    }))
  const alarms = rows
    .filter((row) => row.catalog === 'alarms-demo')
    .sort(byFloorThenId)
    .map((row) => ({
      id: row.id,
      floorId: row.floorId,
      x: row.x,
      z: row.z,
    }))
  return JSON.stringify({ 'cameras-demo': cameras, 'alarms-demo': alarms }, null, 2)
}

export const ANCHOR_TABLE_FILE = 'demo-anchors.json'

export function downloadAnchorTable(): void {
  const blob = new Blob([anchorTableJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = ANCHOR_TABLE_FILE
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function resetAnchorSessionForTests(): void {
  drafts = null
  session = { catalog: 'cameras-demo', mode: 'translate', selectedId: null, revision: 0 }
  listeners.clear()
}
