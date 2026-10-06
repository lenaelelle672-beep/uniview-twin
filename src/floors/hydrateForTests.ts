import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hydrateFloorPlan, isFloorHydrated } from './cache'
import { floorJsonFile } from './deskCounts'
import { parseFloorPlan } from './parsePlan'

export function hydrateFloorFromDisk(floorId: string) {
  if (floorId === 'B1' || isFloorHydrated(floorId)) return
  const path = join(process.cwd(), 'public/floors', floorJsonFile(floorId))
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  hydrateFloorPlan(parseFloorPlan(floorId, raw))
}

export function hydrateAllAboveGrade() {
  for (let level = 1; level <= 22; level += 1) hydrateFloorFromDisk(`F${level}`)
}
