import { Clone } from '@react-three/drei/core/Clone'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useState } from 'react'
import { Group, Mesh, type BufferGeometry, type Material } from 'three'
import {
  CLONE_CAP,
  CLONE_CAST_SHADOW,
  CLONE_DEEP,
  CLONE_RECEIVE_SHADOW,
  CLONE_SPOTS,
  findLampParts,
  fragmentKey,
  presentCloneSpots,
  type LampPart,
} from './plan'

/**
 * 浅拷已加载的路灯片段。几何和材质与实例路灯共享，改颜色或自发光会一起变。
 * deep 固定 false：不要在这里 clone 材质，否则和上面的共享副作用对不上。
 * 阴影标志显式传 true。drei 在标志不为真时不会写 castShadow / receiveShadow。
 */

function buildTemplate(parts: readonly LampPart[]): Group {
  const group = new Group()
  group.name = 'street_lamp'
  for (const part of parts) {
    const mesh = new Mesh(part.geometry as BufferGeometry, part.material as Material)
    mesh.name = part.material.name
    mesh.castShadow = CLONE_CAST_SHADOW
    mesh.receiveShadow = CLONE_RECEIVE_SHADOW
    group.add(mesh)
  }
  return group
}

function noteScene(mounted: boolean, count: number, dropped: number): void {
  const probe = window.__twinClone
  if (!probe?.on) return
  probe.mounted = mounted
  probe.count = count
  probe.dropped = dropped
  probe.deep = CLONE_DEEP
  probe.castShadow = CLONE_CAST_SHADOW
  probe.receiveShadow = CLONE_RECEIVE_SHADOW
  probe.sharedMaterials = true
  probe.source = 'street_lamp'
  probe.cap = CLONE_CAP
}

export function FragmentClones() {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [parts, setParts] = useState<LampPart[]>([])

  useLayoutEffect(() => {
    let id = 0
    const pull = () => {
      const next = findLampParts(scene)
      if (next.length === 0) return
      window.clearInterval(id)
      setParts((prev) => (fragmentKey(prev) === fragmentKey(next) ? prev : next))
    }
    id = window.setInterval(pull, 300)
    pull()
    return () => window.clearInterval(id)
  }, [scene])

  const key = fragmentKey(parts)
  const template = useMemo(() => (key ? buildTemplate(parts) : null), [key, parts])
  const placed = presentCloneSpots(CLONE_SPOTS)

  useLayoutEffect(() => {
    noteScene(template != null, template ? placed.shown.length : 0, placed.dropped)
    invalidate()
    const frame = requestAnimationFrame(() => invalidate())
    void window.__twinInvalidate?.()
    return () => {
      cancelAnimationFrame(frame)
      const probe = window.__twinClone
      if (probe?.on) {
        probe.mounted = false
        probe.count = 0
      }
      invalidate()
    }
  }, [invalidate, placed.dropped, placed.shown.length, template])

  if (!template) return null
  return (
    <group name="FragmentClones">
      {placed.shown.map((spot) => (
        <Clone
          key={spot.id}
          name="FragmentClone"
          object={template}
          deep={CLONE_DEEP}
          position={spot.position}
          rotation={spot.rotation}
          castShadow={CLONE_CAST_SHADOW}
          receiveShadow={CLONE_RECEIVE_SHADOW}
        />
      ))}
    </group>
  )
}
