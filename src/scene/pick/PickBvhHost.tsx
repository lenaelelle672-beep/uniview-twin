import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { growBvhMount, yieldMain } from '../openPathChunk'
import { useTwinStore } from '../../store/store'
import { PickBvhPortal } from './PickBvh'
import { useMeasurePickActive } from './pickBvhTiming'
import {
  collectEnterPickGroups,
  collectMeasurePickGroups,
  pickGroupSignature,
  type PickGroup,
} from './pickTargets'

const PICK_BVH_SCAN_MS = 500

/**
 * 进层外壳和总览测距面。室内楼板不在这里包，避免宿主比楼层活得久，把节点留在预构建缓存里。
 * 这个文件静态引用 Bvh，所以只能在首帧 2600ms 之后由 DemandLoop 动态 import。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function PickBvhHost() {
  const scene = useThree((state) => state.scene)
  const view = useTwinStore((state) => state.view)
  const measure = useMeasurePickActive()
  const targetRef = useRef<PickGroup[]>([])
  const mountedRef = useRef<PickGroup[]>([])
  const [groups, setGroups] = useState<PickGroup[]>([])

  useEffect(() => {
    let stop = false
    let timer = 0
    const scan = () => {
      if (stop) return
      const enter = view === 'building' ? collectEnterPickGroups(scene) : []
      const covered = enter.flatMap((group) => group.objects)
      const measured = measure ? collectMeasurePickGroups(scene, covered) : []
      targetRef.current = [...enter, ...measured]
      timer = window.setTimeout(scan, PICK_BVH_SCAN_MS)
    }
    scan()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [measure, scene, view])

  useEffect(() => {
    let stop = false
    const pump = async () => {
      while (!stop) {
        const target = targetRef.current
        if (pickGroupSignature(mountedRef.current) === pickGroupSignature(target)) {
          await sleep(PICK_BVH_SCAN_MS)
          continue
        }
        await yieldMain()
        if (stop) return
        const next = growBvhMount(mountedRef.current, targetRef.current, pickGroupSignature)
        if (next === mountedRef.current) continue
        mountedRef.current = next
        setGroups(next)
      }
    }
    void pump()
    return () => {
      stop = true
    }
  }, [measure, scene, view])

  return (
    <>
      {groups.map((group) => (
        <PickBvhPortal
          key={pickGroupSignature([group])}
          name={`PickBvh:${group.id}`}
          parent={group.parent}
          targets={group.objects}
        />
      ))}
    </>
  )
}
