import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Group, type Object3D } from 'three'
import { pickBvhDue } from './pickBvhTiming'
import type { PickBvhPortal } from './PickBvh'

type PortalComponent = typeof PickBvhPortal

/**
 * 框选代理的外包。Select 仍在外层，这里只在首帧门之后动态 import Bvh。
 * 链接放在代理组前面：卸载时先让 drei 卸树，再由 DeskPickProxies 的 effect 摘掉旧网格。
 */
export function BoxPickBvh({ children, version }: { children: ReactNode; version: string }) {
  const rootRef = useRef<Group>(null)
  const [root, setRoot] = useState<Group | null>(null)
  const [Portal, setPortal] = useState<ComponentType<Parameters<PortalComponent>[0]> | null>(null)

  useLayoutEffect(() => {
    setRoot(rootRef.current)
  }, [])

  useEffect(() => {
    let stop = false
    let raf = 0
    const tick = () => {
      if (stop) return
      if (!pickBvhDue(window.__twinFirstFrameAt, performance.now())) {
        raf = requestAnimationFrame(tick)
        return
      }
      void import('./PickBvh').then((mod) => {
        if (!stop) setPortal(() => mod.PickBvhPortal)
      })
    }
    tick()
    return () => {
      stop = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <group ref={rootRef} name="BoxPickRoot">
      {root && Portal ? <BoxPickMount key={version} root={root} Portal={Portal} /> : null}
      {children}
    </group>
  )
}

function BoxPickMount({
  root,
  Portal,
}: {
  root: Group
  Portal: ComponentType<Parameters<PortalComponent>[0]>
}) {
  const [target, setTarget] = useState<Object3D | null>(null)
  useLayoutEffect(() => {
    setTarget(root.getObjectByName('DeskPickProxies') ?? null)
  }, [root])
  const targets = useMemo(() => (target ? [target] : []), [target])
  if (!target) return null
  return <Portal name="PickBvh:box" parent={root} targets={targets} />
}
