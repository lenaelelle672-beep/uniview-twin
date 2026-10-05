import { lazy, Suspense } from 'react'
import type { Device } from '../../types'
import type { RoomLabel } from './roomLabels'

const DeviceBadges = lazy(async () => {
  const mod = await import('./DeviceBadges')
  return { default: mod.DeviceBadges }
})

const RoomLabels = lazy(async () => {
  const mod = await import('./RoomLabels')
  return { default: mod.RoomLabels }
})

const CorridorPeople = lazy(async () => {
  const mod = await import('./CorridorPeople')
  return { default: mod.CorridorPeople }
})

/** 单层才挂载。三个动态 import 各自成包，总览图不经过这里。 */
export function FloorDecor({
  floorId,
  devices,
  labels,
  showPeople = false,
}: {
  floorId: string
  devices: Device[]
  labels: RoomLabel[]
  showPeople?: boolean
}) {
  return (
    <>
      <Suspense fallback={null}>
        <DeviceBadges floorId={floorId} devices={devices} />
      </Suspense>
      <Suspense fallback={null}>
        <RoomLabels labels={labels} />
      </Suspense>
      {showPeople ? (
        <Suspense fallback={null}>
          <CorridorPeople enabled />
        </Suspense>
      ) : null}
    </>
  )
}
