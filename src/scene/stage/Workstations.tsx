import { lazy, Suspense } from 'react'
import type { Color } from 'three'
import { WorkstationSkeleton } from './innerFill'
import type { Slot } from './layout'

export { instanceColorAt, InstancedSlots } from './instancedSlots'

const WorkstationMeshes = lazy(() =>
  import('./workstationMeshes').then((mod) => ({ default: mod.WorkstationMeshes })),
)

/** 楼板之外的工位。chunk 未到时先出低模盒，不把外壳打回空白。 */
export function Workstations({ slots, colors }: { slots: Slot[]; colors: Color[] }) {
  return (
    <Suspense fallback={<WorkstationSkeleton slots={slots} />}>
      <WorkstationMeshes slots={slots} colors={colors} />
    </Suspense>
  )
}
