import { floorSpec, listFloorSpecs } from '../data/floors'

export interface FloorMarkerProbe {
  count: number
  renderedBeforeFirstFrame: boolean
  at: number
}

export interface FloorMarkerRow {
  id: string
  name: string
  alarmCount: number
  offlineCount: number
}

/** 总览紧凑列表：F22…F1、B1。 */
export function overviewFloorIds(): string[] {
  const ids: string[] = []
  for (let level = 22; level >= 1; level -= 1) ids.push(`F${level}`)
  ids.push('B1')
  return ids
}

export function overviewFloorRows(
  counts: ReadonlyArray<{ id: string; alarmCount: number; offlineCount: number }> = [],
): FloorMarkerRow[] {
  const byId = new Map(counts.map((floor) => [floor.id, floor]))
  return overviewFloorIds().map((id) => {
    const spec = floorSpec(id)
    const found = byId.get(id)
    return {
      id,
      name: spec.name,
      alarmCount: found?.alarmCount ?? 0,
      offlineCount: found?.offlineCount ?? 0,
    }
  })
}

export function stripFloorRows(rows: readonly FloorMarkerRow[]): FloorMarkerRow[] {
  return rows.filter((row) => row.alarmCount > 0 || row.offlineCount > 0)
}

export function writeFloorMarkerProbe(count: number, at = performance.now()): FloorMarkerProbe {
  const root = globalThis as typeof globalThis & Window
  const first = root.__twinFirstFrameAt
  const prev = root.__twinFloorMarkers
  const renderedBeforeFirstFrame = Boolean(prev?.renderedBeforeFirstFrame) || (count >= 23 && first == null)
  const next: FloorMarkerProbe = { count, renderedBeforeFirstFrame, at }
  root.__twinFloorMarkers = next
  return next
}

export function allOverviewSpecs() {
  return listFloorSpecs()
}
