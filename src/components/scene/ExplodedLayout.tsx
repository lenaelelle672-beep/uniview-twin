import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Object3D } from 'three'
import { listFloorSpecs } from '../../data/floors'
import { explodeOffset, explodeProgress, floorWorldSpan } from '../../scene/explode'
import { useTwinStore } from '../../store/store'

const specs = listFloorSpecs()

/**
 * 爆炸只改各层 group 的 position.y（屋面跟着顶层走）。
 * 不新增网格。离开总览时立刻回到原位，避免单层剖切对着错位的外壳。
 */
export function ExplodedLayout() {
  const scene = useThree((state) => state.scene)
  const exploded = useTwinStore((state) => state.exploded)
  const view = useTwinStore((state) => state.view)
  const anim = useRef({ from: 0, to: 0, start: -1, progress: 0 })
  const cache = useRef(new Map<string, Object3D>())

  useFrame(({ clock }) => {
    const target = exploded && view === 'building' ? 1 : 0
    const now = clock.elapsedTime
    if (view !== 'building') {
      anim.current.progress = 0
      anim.current.from = 0
      anim.current.to = 0
      anim.current.start = now
    } else if (anim.current.to !== target || anim.current.start < 0) {
      anim.current.from = anim.current.progress
      anim.current.to = target
      anim.current.start = now
      anim.current.progress = explodeProgress(anim.current.from, target, 0)
    } else {
      anim.current.progress = explodeProgress(anim.current.from, anim.current.to, now - anim.current.start)
    }

    const progress = anim.current.progress
    const floors: NonNullable<Window['__twinExplode']>['floors'] = []

    specs.forEach((spec, index) => {
      const name = spec.id === 'B1' ? 'B1' : `FloorShell-${spec.id}`
      const object = resolve(scene, cache.current, name)
      const offset = explodeOffset(index, progress)
      if (object) object.position.y = restY(object) + offset
      const span = floorWorldSpan(spec.elevation, spec.height, index, progress)
      floors.push({ id: spec.id, offset, groupY: object?.position.y ?? null, ...span })
    })

    const roof = resolve(scene, cache.current, 'RoofAssembly')
    const roofOffset = explodeOffset(specs.length - 1, progress)
    if (roof) roof.position.y = restY(roof) + roofOffset

    let gap = Number.POSITIVE_INFINITY
    for (let index = 0; index < floors.length - 1; index += 1) {
      gap = Math.min(gap, floors[index + 1].bottom - floors[index].top)
    }

    window.__twinExplode = {
      progress,
      exploded: target === 1 && progress === 1,
      gap,
      overlap: gap < -0.001,
      floors,
    }
  })

  return null
}

function resolve(scene: Object3D, cache: Map<string, Object3D>, name: string) {
  const cached = cache.get(name)
  if (cached?.parent) return cached
  const found = scene.getObjectByName(name)
  if (found) cache.set(name, found)
  else cache.delete(name)
  return found
}

function restY(object: Object3D) {
  if (typeof object.userData.explodeRestY !== 'number') {
    object.userData.explodeRestY = object.position.y
  }
  return object.userData.explodeRestY as number
}
