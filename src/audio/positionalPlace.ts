/**
 * T108：告警设备的平面落点。
 * B1 走工位公式。地上层先读当前层探针，没有再读已经取回的图纸。
 * 不在这里 fetch，挂载点自己决定要不要要图纸。
 */

import { workstationPosition } from '../scene/stage/workstationPosition'
import type { SpatialAnchor } from './positionalPolicy'

export interface DeskFlat {
  id: string
  x: number
  z: number
}

export function desksFromPlan(raw: unknown): DeskFlat[] {
  if (!raw || typeof raw !== 'object') return []
  const desks = (raw as { desks?: unknown }).desks
  if (!Array.isArray(desks)) return []
  const out: DeskFlat[] = []
  for (const item of desks) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: unknown; center?: unknown; x?: unknown; z?: unknown }
    if (typeof row.id !== 'string' || row.id.length === 0) continue
    let x: number | null = null
    let z: number | null = null
    if (Array.isArray(row.center) && row.center.length >= 2) {
      const cx = row.center[0]
      const cz = row.center[1]
      if (typeof cx === 'number' && typeof cz === 'number') {
        x = cx
        z = cz
      }
    } else if (typeof row.x === 'number' && typeof row.z === 'number') {
      x = row.x
      z = row.z
    }
    if (x == null || z == null || !Number.isFinite(x) || !Number.isFinite(z)) continue
    out.push({ id: row.id, x, z })
  }
  return out
}

function b1Flat(deskId: string): DeskFlat | null {
  try {
    const place = workstationPosition('B1', deskId)
    return { id: deskId, x: place.x, z: place.z }
  } catch {
    return null
  }
}

/**
 * 平面坐标。地上层图纸还没到时返回 null，调用方不要认领这一声。
 * live 是当前打开层的探针，plans 是挂载点自己的图纸缓存。两份都对不上就没有落点。
 */
export function flatPoint(
  anchor: SpatialAnchor,
  live: readonly DeskFlat[] | null,
  plans: ReadonlyMap<string, readonly DeskFlat[]>,
): DeskFlat | null {
  if (anchor.floorId === 'B1') return b1Flat(anchor.deskId)
  const fromLive = live?.find((desk) => desk.id === anchor.deskId)
  if (fromLive) return fromLive
  const plan = plans.get(anchor.floorId)
  return plan?.find((desk) => desk.id === anchor.deskId) ?? null
}
