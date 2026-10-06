import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
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

/**
 * 只控制「这一批挂不挂」。不写 opacity / visible，方便叠 #19 的近目标淡出。
 * 告警、选中、搜索命中的目标标签放进第一批，不进后续帧队列。
 */
export function useLabelMountQueue(floorId: string, labels: readonly RoomLabel[]): LabelMountQueue {
  const invalidate = useThree((state) => state.invalidate)
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
  const [epoch, setEpoch] = useState({ packKey, released: 0 })
  if (epoch.packKey !== packKey) {
    setEpoch({ packKey, released: 0 })
  }
  const released = epoch.packKey === packKey ? epoch.released : 0

  useEffect(() => {
    beginLabelPack(floorId)
  }, [floorId, packKey])

  useEffect(() => {
    const remaining = Math.max(0, ordered.length - firstCount)
    if (released >= remaining) return
    let cancelled = false
    const id = window.requestAnimationFrame(() => {
      if (cancelled) return
      setEpoch((current) => {
        if (current.packKey !== packKey) return current
        return { packKey, released: Math.min(current.released + LABEL_MOUNT_PER_FRAME, remaining) }
      })
      invalidate()
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(id)
    }
  }, [firstCount, invalidate, ordered.length, packKey, released])

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

  const queue: LabelMountQueue = {
    slices,
    priorityIds,
    firstBatchIds: firstBatch.map((label) => label.id),
    mountedIds: ordered.slice(0, mountedCount).map((label) => label.id),
    total: ordered.length,
    done: mountedCount >= ordered.length,
  }
  publishMount(floorId, queue)
  return queue
}
