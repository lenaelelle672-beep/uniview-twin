import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import { BatchedRoomLabels } from '../stage/BatchedRoomLabels'
import { roomLabelCharacters, type RoomLabel } from '../stage/roomLabels'
import { useLabelMountQueue, type LabelMountSlice } from './useLabelMountQueue'

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
  return (
    <group name="ProgressiveRoomLabels">
      {queue.slices.map((slice) => (
        <SlicedRoomLabels
          key={slice.key}
          floorId={floorId}
          allLabels={labels}
          slice={slice}
          fontSize={fontSize}
          outlineWidth={outlineWidth}
          parentFades={fadesRef}
        />
      ))}
    </group>
  )
}

function SlicedRoomLabels({
  floorId,
  allLabels,
  slice,
  fontSize,
  outlineWidth,
  parentFades,
}: {
  floorId: string
  allLabels: RoomLabel[]
  slice: LabelMountSlice
  fontSize: number
  outlineWidth: number
  parentFades: MutableRefObject<number[]>
}) {
  const indexMap = useMemo(
    () => slice.labels.map((label) => allLabels.findIndex((item) => item.id === label.id)),
    [allLabels, slice.labels],
  )
  const sliceFades = useRef<number[]>([])
  const dest = sliceFades.current
  dest.length = slice.labels.length
  for (let i = 0; i < indexMap.length; i += 1) {
    const srcIndex = indexMap[i] ?? -1
    dest[i] = srcIndex >= 0 ? (parentFades.current[srcIndex] ?? 1) : 1
  }
  useFrame(() => {
    const src = parentFades.current
    const dest = sliceFades.current
    dest.length = slice.labels.length
    for (let i = 0; i < indexMap.length; i += 1) {
      const srcIndex = indexMap[i] ?? -1
      dest[i] = srcIndex >= 0 ? (src[srcIndex] ?? 1) : 1
    }
  })
  return (
    <BatchedRoomLabels
      floorId={floorId}
      labels={slice.labels}
      fontSize={fontSize}
      outlineWidth={outlineWidth}
      characters={roomLabelCharacters(slice.labels)}
      fadesRef={sliceFades}
    />
  )
}
