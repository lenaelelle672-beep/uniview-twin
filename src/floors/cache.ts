import type { Slot } from '../scene/stage/layout'
import type { FloorPlan } from './types'

const plans = new Map<string, FloorPlan>()
const slots = new Map<string, Slot[]>()

export function hydrateFloorPlan(plan: FloorPlan) {
  plans.set(plan.floorId, plan)
  slots.set(
    plan.floorId,
    plan.desks.map((desk) => ({ x: desk.x, z: desk.z, rot: desk.rot })),
  )
}

export function isFloorHydrated(floorId: string): boolean {
  return plans.has(floorId)
}

export function getFloorPlan(floorId: string): FloorPlan | undefined {
  return plans.get(floorId)
}

export function getFloorSlots(floorId: string): Slot[] | undefined {
  return slots.get(floorId)
}

export function clearFloorCache(floorId?: string) {
  if (floorId) {
    plans.delete(floorId)
    slots.delete(floorId)
    return
  }
  plans.clear()
  slots.clear()
}
