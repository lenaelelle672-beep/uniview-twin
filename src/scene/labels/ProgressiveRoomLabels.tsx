import { BatchedRoomLabels } from '../stage/BatchedRoomLabels'
import { roomLabelCharacters, type RoomLabel } from '../stage/roomLabels'
import { useLabelMountQueue } from './useLabelMountQueue'

/**
 * 外层包装：按帧补挂 BatchedRoomLabels，不改每个标签的显隐/透明度。
 * RoomLabels 仍走原来的 lazy 边界，#19 的淡出叠上来时只影响已挂上的标签自身。
 */
export function ProgressiveRoomLabels({
  floorId,
  labels,
  fontSize,
  outlineWidth,
  characters: _characters,
}: {
  floorId: string
  labels: RoomLabel[]
  fontSize: number
  outlineWidth: number
  characters: string
}) {
  const queue = useLabelMountQueue(floorId, labels)
  return (
    <group name="ProgressiveRoomLabels">
      {queue.slices.map((slice) => (
        <BatchedRoomLabels
          key={slice.key}
          floorId={floorId}
          labels={slice.labels}
          fontSize={fontSize}
          outlineWidth={outlineWidth}
          characters={roomLabelCharacters(slice.labels)}
        />
      ))}
    </group>
  )
}
