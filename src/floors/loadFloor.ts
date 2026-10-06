import { hydrateFloorPlan, isFloorHydrated, getFloorPlan } from './cache'
import { floorJsonFile } from './deskCounts'
import { parseFloorPlan } from './parsePlan'
import type { FloorPlan } from './types'

const pending = new Map<string, Promise<FloorPlan>>()

export async function loadFloorPlan(floorId: string): Promise<FloorPlan> {
  const cached = getFloorPlan(floorId)
  if (cached) return cached
  const inflight = pending.get(floorId)
  if (inflight) return inflight
  const request = fetch(`/floors/${floorJsonFile(floorId)}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`无法加载楼层图纸：${floorId}（HTTP ${response.status}）`)
      return (await response.json()) as unknown
    })
    .then((raw) => {
      const plan = parseFloorPlan(floorId, raw)
      hydrateFloorPlan(plan)
      return plan
    })
    .finally(() => {
      pending.delete(floorId)
    })
  pending.set(floorId, request)
  return request
}

export function peekFloorPlan(floorId: string): FloorPlan | undefined {
  return isFloorHydrated(floorId) ? getFloorPlan(floorId) : undefined
}
