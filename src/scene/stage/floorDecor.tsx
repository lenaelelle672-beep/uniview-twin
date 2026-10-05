import type { Device } from '../../types'
import { CorridorPeople } from './CorridorPeople'
import { DeviceBadges } from './DeviceBadges'
import { RoomLabels } from './RoomLabels'
import type { RoomLabel } from './roomLabels'

/**
 * D109：T009 人物、标签、圆标与它们用到的 drei Line / Billboard /
 * Detailed / useAnimations（以及因此拖进来的 three-stdlib）打成一个按需包。
 * troika + Text 不在这里静态引入。
 */
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
      <DeviceBadges floorId={floorId} devices={devices} />
      <RoomLabels labels={labels} />
      {showPeople ? <CorridorPeople enabled /> : null}
    </>
  )
}
