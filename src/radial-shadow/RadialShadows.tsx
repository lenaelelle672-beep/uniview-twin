import { Shadow } from '@react-three/drei/core/Shadow'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import {
  RADIAL_SHADOW_COLOR,
  RADIAL_SHADOW_COLOR_STOP,
  RADIAL_SHADOW_OPACITY,
  RADIAL_SHADOW_POLYGON_OFFSET,
  RADIAL_SHADOW_SCALE,
} from './plan'
import { interiorElements, sameSpots, shadowSpots, type Spot } from './place'
import { noteRadialShadow } from './probe'

type BiasedMaterial = {
  polygonOffset?: boolean
  polygonOffsetFactor?: number
  polygonOffsetUnits?: number
}

/** drei Shadow 不把 polygonOffset 转给材质，挂上之后补一次。 */
function biasShadowMaterial(material: BiasedMaterial | BiasedMaterial[] | undefined): boolean {
  if (!material || Array.isArray(material)) return false
  if (material.polygonOffset === true && material.polygonOffsetFactor === RADIAL_SHADOW_POLYGON_OFFSET) return false
  material.polygonOffset = true
  material.polygonOffsetFactor = RADIAL_SHADOW_POLYGON_OFFSET
  material.polygonOffsetUnits = RADIAL_SHADOW_POLYGON_OFFSET
  return true
}

/** 透明圆斑不参加拾取，点选仍落到工位。 */
function ignoreShadowPick() {
  // 不往 intersects 里推。
}

/**
 * T120：每张种子桌或选中工位脚下一块 drei Shadow。
 * Shadow 自己画 128² canvas 径向渐变，贴在旋转平放的 plane 上，组件内部没有 useFrame。
 * 这里也只在挂上和室内矩阵出现时读一次落点。室内组还没进场景就过一会儿再读，读到就停。
 * 不写实例矩阵，也不走接触阴影或软阴影那两条路径。
 */
export function RadialShadows({ floorId, deskKey }: { floorId: string; deskKey: string }) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [spots, setSpots] = useState<Spot[] | null>(null)
  const root = useRef<{ traverse: (fn: (object: { material?: BiasedMaterial | BiasedMaterial[] }) => void) => void } | null>(null)

  useLayoutEffect(() => {
    let changed = false
    root.current?.traverse((object) => {
      if (biasShadowMaterial(object.material)) changed = true
    })
    if (changed) invalidate()
  }, [invalidate, spots])

  useLayoutEffect(() => {
    let stop = false
    let timer = 0
    const ids = deskKey.split('|').filter((id) => id.length > 0)
    const pull = () => {
      if (stop) return
      const probe = window.__twinFloor
      const desks = probe?.floorId === floorId ? probe.desks : []
      const next = shadowSpots(interiorElements(scene), desks, ids)
      if (!next) {
        timer = window.setTimeout(pull, 200)
        return
      }
      setSpots((prev) => (sameSpots(prev, next) ? prev : next))
      const prev = window.__twinRadialShadow
      const changed = prev?.mounted !== true || prev.count !== next.length
      noteRadialShadow(next.length)
      if (changed) invalidate()
    }
    pull()
    return () => {
      stop = true
      window.clearTimeout(timer)
      noteRadialShadow(0)
      invalidate()
    }
  }, [deskKey, floorId, invalidate, scene])

  if (!spots || spots.length === 0) return null

  return (
    <group ref={root} name="RadialShadows">
      {spots.map((spot) => (
        <Shadow
          key={spot.id}
          name={`RadialShadow:${spot.id}`}
          position={[spot.x, spot.y, spot.z]}
          scale={RADIAL_SHADOW_SCALE}
          color={RADIAL_SHADOW_COLOR}
          colorStop={RADIAL_SHADOW_COLOR_STOP}
          opacity={RADIAL_SHADOW_OPACITY}
          fog={false}
          depthWrite={false}
          renderOrder={2}
          frustumCulled={false}
          raycast={ignoreShadowPick}
        />
      ))}
    </group>
  )
}
