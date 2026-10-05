import { lazy, Suspense } from 'react'
import type { Device } from '../../types'
import type { Point } from './corridor'
import type { RoomLabel } from './roomLabels'

const FloorDecorImpl = lazy(async () => {
  const mod = await import('./floorDecor')
  return { default: mod.FloorDecor }
})

/** 单层才挂载。楼板/墙/房间在主包，这里只补人物、标签和圆标。 */
export function FloorDecor({
  floorId,
  devices,
  labels,
  showPeople = false,
  paths,
}: {
  floorId: string
  devices: Device[]
  labels: RoomLabel[]
  showPeople?: boolean
  paths?: Point[][]
}) {
  return (
    <Suspense fallback={null}>
      <FloorDecorImpl floorId={floorId} devices={devices} labels={labels} showPeople={showPeople} paths={paths} />
    </Suspense>
  )
}
