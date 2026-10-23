import { Bvh } from '@react-three/drei/core/Bvh'
import { createPortal, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { BufferGeometry, Group, Mesh, type Object3D } from 'three'
import { pickBvhHomeOf } from './pickBvhHome'

/**
 * drei 10.7.9 的 Bvh 在卸载 effect 里遍历仍挂在组上的网格，卸掉包围树并恢复 raycast。
 * 组件被删掉时，被动 effect 是父级先清、子级后清。送回原父级必须写在 Bvh 的子节点里，
 * 否则网格先离开，drei 遍历不到，树就留在几何体上。
 * React 摘组发生在 effect 之前，demand 的下一帧会把摘掉的网格画丢。
 * layout 清理先把组挂回原父级，等 drei 卸完再把网格送回去并清掉空组。
 * firstHitOnly 写在 R3F 那支共享射线上。drei 卸载时会删掉它，还有别的组时由子节点再写回。
 */

let mounted = 0
const treeCounts = new Map<string, number>()

function ignoreBoxProxyRaycast() {}

function publish(name: string, trees: number | null) {
  if (trees == null) treeCounts.delete(name)
  else treeCounts.set(name, trees)
  if (typeof window === 'undefined') return
  let total = 0
  for (const count of treeCounts.values()) total += count
  window.__twinPickBvh = { mounted: treeCounts.size, trees: total }
}

function boundsTrees(targets: readonly Object3D[]): number {
  const seen = new Set<BufferGeometry>()
  let count = 0
  for (const target of targets) {
    target.traverse((child) => {
      const mesh = child as Mesh
      const geometry = mesh.geometry as (BufferGeometry & { boundsTree?: unknown }) | undefined
      if (!mesh.isMesh || !geometry?.boundsTree || seen.has(geometry)) return
      seen.add(geometry)
      count += 1
    })
  }
  return count
}

function rememberHome(target: Object3D) {
  if (target.userData.pickBvhHome) return
  const home = pickBvhHomeOf(target)
  if (home) target.userData.pickBvhHome = home
}

function restoreHome(target: Object3D) {
  const home = target.userData.pickBvhHome as Object3D | undefined
  if (home) home.add(target)
  delete target.userData.pickBvhHome
}

function armBoxProxies(target: Object3D) {
  target.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh && mesh.userData.boxPickProxy === true) mesh.raycast = Mesh.prototype.raycast
  })
}

function silenceBoxProxies(target: Object3D) {
  target.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh && mesh.userData.boxPickProxy === true) mesh.raycast = ignoreBoxProxyRaycast
  })
}

function setSharedFirstHit(raycaster: object, on: boolean) {
  if (on) (raycaster as { firstHitOnly?: boolean }).firstHitOnly = true
}

function Reparent({ targets }: { targets: readonly Object3D[] }) {
  const marker = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const raycaster = useThree((state) => state.raycaster)
  useEffect(() => {
    const bvhGroup = marker.current?.parent
    if (!bvhGroup) return
    const moved: Object3D[] = []
    for (const target of targets) {
      // 框选代理把 raycast 换成空函数，drei 只给仍是 Mesh.prototype.raycast 的网格建树。
      // 建完再由父 effect 改回空函数。SelectionBox 不走 raycast。
      armBoxProxies(target)
      rememberHome(target)
      bvhGroup.add(target)
      moved.push(target)
    }
    bvhGroup.updateMatrixWorld(true)
    invalidate()
    return () => {
      for (const target of moved) {
        restoreHome(target)
        silenceBoxProxies(target)
      }
      if (bvhGroup.parent) bvhGroup.removeFromParent()
      if (mounted > 0) setSharedFirstHit(raycaster, true)
      invalidate()
    }
  }, [invalidate, raycaster, targets])
  return <group ref={marker} name="PickBvh:anchor" />
}

export function PickBvh({ name, targets }: { name: string; targets: readonly Object3D[] }) {
  const groupRef = useRef<Group>(null)
  const placed = useRef<{ group: Group; home: Object3D } | null>(null)
  const raycaster = useThree((state) => state.raycaster)

  useLayoutEffect(() => {
    const group = groupRef.current
    const home = group?.parent ?? null
    if (group && home) placed.current = { group, home }
    return () => {
      const saved = placed.current
      if (!saved || saved.group.parent === saved.home) return
      saved.home.add(saved.group)
      saved.group.updateMatrixWorld(true)
    }
  }, [targets])

  useEffect(() => {
    mounted += 1
    setSharedFirstHit(raycaster, true)
    for (const target of targets) silenceBoxProxies(target)
    publish(name, boundsTrees(targets))
    return () => {
      mounted -= 1
      publish(name, null)
    }
  }, [name, raycaster, targets])

  return (
    <Bvh ref={groupRef} firstHitOnly name={name}>
      <Reparent targets={targets} />
    </Bvh>
  )
}

export function PickBvhPortal({
  name,
  parent,
  targets,
}: {
  name: string
  parent: Object3D
  targets: readonly Object3D[]
}) {
  if (targets.length === 0) return null
  return createPortal(<PickBvh name={name} targets={targets} />, parent)
}
