import type { Device } from '../../types'
import type { Point } from './corridor'
import { CorridorPeople } from './CorridorPeople'
import { DeviceBadges } from './DeviceBadges'
import { RoomLabels } from './RoomLabels'
import { WalkPaths } from './WalkPaths'
import type { RoomLabel } from './roomLabels'

/**
 * D109：T009 人物、标签、圆标与它们用到的 drei Line / Billboard /
 * Detailed / useAnimations（以及因此拖进来的 three-stdlib）打成一个按需包。
 * T048 人流路径同包，不进首屏。troika + Text 不在这里静态引入。
 */
export function FloorLabelsOnly({ floorId, labels }: { floorId: string; labels: RoomLabel[] }) {
  return (
    <>
      <RoomLabels floorId={floorId} labels={labels} />
      <WalkPaths floorId={floorId} />
    </>
  )
}

/** 出齐窗口结束再挂。和标签拆开，避免圆标/人物挤进飞入帧。 */
export function FloorHeavyDecor({
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
    <>
      <DeviceBadges floorId={floorId} devices={devices} />
      {showPeople ? <CorridorPeople enabled paths={paths} /> : null}
    </>
  )
}

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
    <>
      <FloorLabelsOnly floorId={floorId} labels={labels} />
      <FloorHeavyDecor floorId={floorId} devices={devices} showPeople={showPeople} paths={paths} />
    </>
  )
}
