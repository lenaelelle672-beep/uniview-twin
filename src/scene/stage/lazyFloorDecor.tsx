import { lazy, Suspense } from 'react'
import type { Device } from '../../types'
import type { Point } from './corridor'
import type { RoomLabel } from './roomLabels'

const FloorDecorImpl = lazy(async () => {
  const mod = await import('./floorDecor')
  return { default: mod.FloorDecor }
})

const FloorLabelsImpl = lazy(async () => {
  const mod = await import('./floorDecor')
  return { default: mod.FloorLabelsOnly }
})

const FloorHeavyImpl = lazy(async () => {
  const mod = await import('./floorDecor')
  return { default: mod.FloorHeavyDecor }
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

/** 室内第一绘之后再挂标签。仍走 floorDecor 按需包，不把 troika 打进室内包。 */
export function FloorLabels({ floorId, labels }: { floorId: string; labels: RoomLabel[] }) {
  return (
    <Suspense fallback={null}>
      <FloorLabelsImpl floorId={floorId} labels={labels} />
    </Suspense>
  )
}

/** 出齐 + 1s 之后再挂圆标和人物。 */
export function FloorHeavy({
  floorId,
  devices,
  showPeople = false,
  paths,
}: {
  floorId: string
  devices: Device[]
  showPeople?: boolean
  paths?: Point[][]
}) {
  return (
    <Suspense fallback={null}>
      <FloorHeavyImpl floorId={floorId} devices={devices} showPeople={showPeople} paths={paths} />
    </Suspense>
  )
}
