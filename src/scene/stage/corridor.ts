import { TOWER } from '../siteGeometry'
import { CORE, MEETINGS, type Point } from './layout'
import { showPeopleMarks } from './showCorridorPeople'

export type { Point }

/** 走廊里同时走动的人数上限。性能档不生成。 */
export const CORRIDOR_PEOPLE_COUNT = 12

export const WALK_METERS_PER_SECOND = 1.15

/** 按身高 1.75 m。animated-human 只作性能档替代，性能档按验收不生成人物。 */
export const PERSON_SCALE = {
  man: 0.364,
  woman: 0.379,
  human: 0.334,
} as const

export interface PathSample {
  x: number
  z: number
  heading: number
}

/**
 * 塔楼标准层走廊折线。
 * 北段贴在会议室南墙外侧，环廊贴着核心筒外皮，两端收到塔楼外墙以内。
 * 数值都从 layout / site 的房间包围盒外推，不手写另一套平面。
 */
export function towerCorridorPolyline(): Point[] {
  const meetingSouth = Math.max(...MEETINGS.map((room) => room.z1))
  const northZ = meetingSouth + 0.95
  const returnZ = northZ + 0.65
  const west = TOWER.minX + 2.3
  const east = TOWER.maxX - 2.3
  const coreWest = CORE.x0 - 0.9
  const coreEast = CORE.x1 + 0.9
  const coreSouth = CORE.z1 + 1.15
  return [
    { x: west, z: northZ },
    { x: east, z: northZ },
    { x: east, z: returnZ },
    { x: coreEast, z: returnZ },
    { x: coreEast, z: coreSouth },
    { x: coreWest, z: coreSouth },
    { x: coreWest, z: returnZ },
    { x: west, z: returnZ },
  ]
}

export function pathLength(points: Point[]): number {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    total += Math.hypot(end.x - start.x, end.z - start.z)
  }
  return total
}

/** 沿闭合折线走 distance 米。heading 让模型正面（+Z）对准切线。 */
export function pointOnPath(points: Point[], distance: number): PathSample {
  const length = pathLength(points)
  if (length <= 0 || points.length === 0) return { x: 0, z: 0, heading: 0 }
  let remaining = ((distance % length) + length) % length
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const dx = end.x - start.x
    const dz = end.z - start.z
    const segment = Math.hypot(dx, dz)
    if (remaining <= segment || index === points.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, remaining / segment)
      return {
        x: start.x + dx * t,
        z: start.z + dz * t,
        heading: Math.atan2(dx, dz),
      }
    }
    remaining -= segment
  }
  const first = points[0]
  return { x: first.x, z: first.z, heading: 0 }
}

export function samplePath(points: Point[], step: number): PathSample[] {
  const length = pathLength(points)
  const samples: PathSample[] = []
  const count = Math.max(1, Math.ceil(length / step))
  for (let index = 0; index < count; index += 1) {
    samples.push(pointOnPath(points, (length * index) / count))
  }
  return samples
}

export interface CorridorPerson {
  model: 'man' | 'woman'
  offset: number
}

export function corridorRoster(count = CORRIDOR_PEOPLE_COUNT): CorridorPerson[] {
  const extra = showPeopleMarks.reduce<number>((sum, mark) => sum + mark, 0)
  return Array.from({ length: count + extra }, (_, index) => ({
    model: index % 2 === 0 ? 'man' : 'woman',
    offset: index / count,
  }))
}

export { showCorridorPeople } from './showCorridorPeople'
