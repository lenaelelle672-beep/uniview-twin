import { useMemo, type MutableRefObject } from 'react'
import { BatchedRoomLabels } from '../stage/BatchedRoomLabels'
import { roomLabelCharacters, type RoomLabel } from '../stage/roomLabels'
import { useLabelMountQueue } from './useLabelMountQueue'

function sliceFadesRef(
  fadesRef: MutableRefObject<number[]>,
  slice: readonly RoomLabel[],
  indexById: Map<string, number>,
): MutableRefObject<number[]> {
  const local: number[] = []
  return {
    get current() {
      local.length = slice.length
      for (let index = 0; index < slice.length; index += 1) {
        const fullIndex = indexById.get(slice[index]!.id)
        local[index] = fullIndex == null ? 1 : (fadesRef.current[fullIndex] ?? 1)
      }
      return local
    },
    set current(_) {},
  }
}

/**
 * 外层包装：按帧补挂 BatchedRoomLabels，不改每个标签的显隐/透明度。
 * RoomLabels 仍走原来的 lazy 边界，#19 的淡出按全量数组下标映射到各 slice。
 */
export function ProgressiveRoomLabels({
  floorId,
  labels,
  fontSize,
  outlineWidth,
  characters: _characters,
  fadesRef,
}: {
  floorId: string
  labels: RoomLabel[]
  fontSize: number
  outlineWidth: number
  characters: string
  fadesRef: MutableRefObject<number[]>
}) {
  const queue = useLabelMountQueue(floorId, labels)
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    labels.forEach((label, index) => map.set(label.id, index))
    return map
  }, [labels])
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
          fadesRef={sliceFadesRef(fadesRef, slice.labels, indexById)}
        />
      ))}
    </group>
  )
}
