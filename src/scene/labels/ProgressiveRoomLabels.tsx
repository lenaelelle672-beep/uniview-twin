import type { MutableRefObject } from 'react'
import { BatchedRoomLabels, type LabelBatchApi } from '../stage/BatchedRoomLabels'
import type { LabelPackState } from '../stage/labelAvoidance'
import type { RoomLabel } from '../stage/roomLabels'
import { useLabelMountQueue } from './useLabelMountQueue'

/**
 * D191 分批探针 + #22 单批上屏。
 * useLabelMountQueue 仍按 30 个/帧发布 __twinLabelMount（D229 用它判断未齐）。
 * 真正绘制走一份 BatchedRoomLabels：#22 的 cluster、一次 batch.sync、进层就绪不能拆成多份。
 */
export function ProgressiveRoomLabels({
  floorId,
  labels,
  fontSize,
  outlineWidth,
  characters,
  fadesRef,
  packRef,
  measureRef,
}: {
  floorId: string
  labels: RoomLabel[]
  fontSize: number
  outlineWidth: number
  characters: string
  fadesRef: MutableRefObject<number[]>
  packRef: MutableRefObject<LabelPackState>
  measureRef: MutableRefObject<LabelBatchApi | null>
}) {
  useLabelMountQueue(floorId, labels)
  return (
    <BatchedRoomLabels
      floorId={floorId}
      labels={labels}
      fontSize={fontSize}
      outlineWidth={outlineWidth}
      characters={characters}
      fadesRef={fadesRef}
      packRef={packRef}
      measureRef={measureRef}
    />
  )
}
