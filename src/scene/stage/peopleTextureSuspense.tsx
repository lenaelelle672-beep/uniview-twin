import { Suspense, type ReactNode } from 'react'
import { BoxGeometry, MeshStandardMaterial } from 'three'
import { CORRIDOR_PEOPLE_COUNT, corridorRoster, pathLength, pointOnPath, towerCorridorPolyline, type Point } from './corridor'
import { InstancedSlots } from './instancedSlots'
import type { Slot } from './layout'

const personBox = new BoxGeometry(0.38, 1.6, 0.28)
personBox.translate(0, 0.8, 0)
const personMat = new MeshStandardMaterial({ color: '#c5ccd4', roughness: 1, metalness: 0 })

/**
 * 人物低模盒站位。和 CorridorPeople 同一套路径，不是另一套 LOD。
 * 空路径不放盒子，楼下已有的楼板就算占位。
 */
export function peopleSkeletonSlots(paths: Point[][] | undefined): Slot[] {
  const resolved = paths && paths.length > 0 ? paths : paths === undefined ? [towerCorridorPolyline()] : []
  if (resolved.length === 0) return []
  return corridorRoster(CORRIDOR_PEOPLE_COUNT).map((person, index) => {
    const path = resolved[index % resolved.length]
    const length = path ? pathLength(path) : 0
    if (!path || path.length === 0 || length <= 0) return { x: 0, z: 0, rot: 0 }
    const sample = pointOnPath(path, person.offset * length)
    return { x: sample.x, z: sample.z, rot: sample.heading }
  })
}

export function PeopleSkeleton({ paths }: { paths?: Point[][] }) {
  const slots = peopleSkeletonSlots(paths)
  if (slots.length === 0) return null
  return (
    <InstancedSlots
      name="PeopleSkeleton"
      geometry={personBox}
      material={personMat}
      slots={slots}
      castShadow={false}
    />
  )
}

/**
 * 人物网格和 GLB 贴图的内层。fallback 是低模盒。
 * 不引 drei Loader，也不另开一套远近换模。房间字留在原来的标签包。
 */
export function PeopleTextureSuspense({ paths, children }: { paths?: Point[][]; children: ReactNode }) {
  return <Suspense fallback={<PeopleSkeleton paths={paths} />}>{children}</Suspense>
}
