import { useEffect, useMemo, useRef } from 'react'
import { useTwinStore } from '../../store/store'
import type { RoomLabel } from '../stage/roomLabels'
import { beginLabelPack } from './labelPackTiming'
import { pickPriorityLabels } from './labelPriority'

/** 每帧最多补挂的非优先标签数。优先标签不计入排队。 */
export const LABEL_MOUNT_PER_FRAME = 30

export interface LabelMountSlice {
  key: string
  labels: RoomLabel[]
}

export interface LabelMountQueue {
  slices: LabelMountSlice[]
  priorityIds: string[]
  firstBatchIds: string[]
  mountedIds: string[]
  total: number
  done: boolean
}

function publishMount(floorId: string, queue: LabelMountQueue) {
  window.__twinLabelMount = {
    floorId,
    mounted: queue.mountedIds.length,
    total: queue.total,
    priorityIds: queue.priorityIds,
    firstBatchIds: queue.firstBatchIds,
    mountedIds: queue.mountedIds,
    done: queue.done,
  }
}

function queueAt(
  floorId: string,
  ordered: readonly RoomLabel[],
  priorityIds: string[],
  firstCount: number,
  released: number,
): LabelMountQueue {
  const mountedCount = Math.min(ordered.length, firstCount + released)
  const firstBatch = ordered.slice(0, firstCount)
  const extra = ordered.slice(firstCount, mountedCount)
  const slices: LabelMountSlice[] = []
  if (firstBatch.length > 0) {
    slices.push({ key: `${floorId}:priority`, labels: firstBatch })
  }
  for (let index = 0; index < extra.length; index += LABEL_MOUNT_PER_FRAME) {
    const batch = extra.slice(index, index + LABEL_MOUNT_PER_FRAME)
    slices.push({ key: `${floorId}:b${index / LABEL_MOUNT_PER_FRAME}`, labels: batch })
  }
  return {
    slices,
    priorityIds,
    firstBatchIds: firstBatch.map((label) => label.id),
    mountedIds: ordered.slice(0, mountedCount).map((label) => label.id),
    total: ordered.length,
    done: mountedCount >= ordered.length,
  }
}

/**
 * 只控制「这一批挂不挂」的探针。不写 opacity / visible，方便叠 #19 的近目标淡出。
 * 告警、选中、搜索命中的目标标签放进第一批，不进后续帧队列。
 * 绘制是一份 BatchedRoomLabels。探针用 rAF 推进，不再 setState，避免每 30 个标签向 demand 要一帧。
 */
export function useLabelMountQueue(floorId: string, labels: readonly RoomLabel[]): LabelMountQueue {
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const focusedDeviceId = useTwinStore((state) => state.focusedDeviceId)
  const searchQuery = useTwinStore((state) => state.searchQuery)

  const priority = useMemo(
    () => pickPriorityLabels(floorId, labels),
    [floorId, focusedDeskId, focusedDeviceId, labels, searchQuery],
  )
  const priorityIds = useMemo(() => priority.map((label) => label.id), [priority])
  const ordered = useMemo(() => {
    const first = new Set(priorityIds)
    return [...priority, ...labels.filter((label) => !first.has(label.id))]
  }, [labels, priority, priorityIds])

  const firstCount = Math.max(priority.length, Math.min(LABEL_MOUNT_PER_FRAME, ordered.length))
  const packKey = `${floorId}:${ordered.map((label) => label.id).join('|')}`
  const releasedRef = useRef(0)
  const packKeyRef = useRef(packKey)
  const packStartedFor = useRef<string | null>(null)
  if (packKeyRef.current !== packKey) {
    packKeyRef.current = packKey
    releasedRef.current = 0
  }
  if (packStartedFor.current !== packKey) {
    packStartedFor.current = packKey
    beginLabelPack(floorId)
  }

  const queue = queueAt(floorId, ordered, priorityIds, firstCount, releasedRef.current)
  publishMount(floorId, queue)

  useEffect(() => {
    const remaining = Math.max(0, ordered.length - firstCount)
    if (releasedRef.current >= remaining) return
    let raf = 0
    const tick = () => {
      releasedRef.current = Math.min(releasedRef.current + LABEL_MOUNT_PER_FRAME, remaining)
      publishMount(floorId, queueAt(floorId, ordered, priorityIds, firstCount, releasedRef.current))
      if (releasedRef.current < remaining) raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [firstCount, floorId, ordered, priorityIds, packKey])

  return queue
}
