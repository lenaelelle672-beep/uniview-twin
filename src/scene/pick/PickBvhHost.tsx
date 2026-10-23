import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
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
export function PickBvhHost() {
  const scene = useThree((state) => state.scene)
  const view = useTwinStore((state) => state.view)
  const measure = useMeasurePickActive()
  const [groups, setGroups] = useState<PickGroup[]>([])

  useEffect(() => {
    let stop = false
    let timer = 0
    const scan = () => {
      if (stop) return
      const enter = view === 'building' ? collectEnterPickGroups(scene) : []
      const covered = enter.flatMap((group) => group.objects)
      const measured = measure ? collectMeasurePickGroups(scene, covered) : []
      const next = [...enter, ...measured]
      setGroups((prev) => (pickGroupSignature(prev) === pickGroupSignature(next) ? prev : next))
      timer = window.setTimeout(scan, PICK_BVH_SCAN_MS)
    }
    scan()
    return () => {
      stop = true
      window.clearTimeout(timer)
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
