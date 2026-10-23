import { useEffect, useMemo, useState, type ComponentType } from 'react'
import type { Object3D } from 'three'
import { pickBvhHomeOf } from './pickBvhHome'
import { pickBvhDue, useMeasurePickActive } from './pickBvhTiming'
import type { PickBvhPortal } from './PickBvh'

type PortalComponent = typeof PickBvhPortal

/**
 * 室内楼板的测距包围。只在测距打开且过了首帧门之后才动态 import Bvh，
 * 楼层深链的预取不能把 three-mesh-bvh 拉进 cutoff。
 * 关掉测距就卸掉 portal，楼板回到 FloorPlate，预构建缓存还能复用。
 */
export function MeasureSurface({ name, target }: { name: string; target: Object3D | null }) {
  if (!target) return null
  return <MeasureSurfaceLive key={target.uuid} name={name} target={target} />
}

function MeasureSurfaceLive({ name, target }: { name: string; target: Object3D }) {
  const measure = useMeasurePickActive()
  const targets = useMemo(() => [target], [target])
  const [due, setDue] = useState(() =>
    typeof performance === 'undefined' ? false : pickBvhDue(window.__twinFirstFrameAt, performance.now()),
  )
  const [Portal, setPortal] = useState<ComponentType<Parameters<PortalComponent>[0]> | null>(null)

  useEffect(() => {
    if (!measure || due) return
    let stop = false
    let raf = 0
    const tick = () => {
      if (stop) return
      if (pickBvhDue(window.__twinFirstFrameAt, performance.now())) {
        setDue(true)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      stop = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [due, measure])

  useEffect(() => {
    if (!measure || !due || Portal) return
    let stop = false
    void import('./PickBvh').then((mod) => {
      if (!stop) setPortal(() => mod.PickBvhPortal)
    })
    return () => {
      stop = true
    }
  }, [Portal, due, measure])

  if (!measure || !due || !Portal) return null
  const parent = pickBvhHomeOf(target)
  if (!parent) return null
  return <Portal name={name} parent={parent} targets={targets} />
}
