import { CubeCamera } from '@react-three/drei/core/CubeCamera'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, useState } from 'react'
import type { Object3D, Texture } from 'three'
import { armCubeUpdate } from './bake'
import { CUBE_PROBE_NEAR, CUBE_PROBE_RESOLUTION, pickRoomGlass, type ProbeNode } from './plan'
import { noteCubeBake } from './probe'
import { placementOf, type ProbePlacement } from './place'

/**
 * T129：drei CubeCamera，frames={1}。
 * 库的缺省会每次绘制都 camera.update。这里只烘一次。
 * 会话里再包一层 update，组件重渲染把内部计数清掉时也不会再烘。
 * 不传 envMap / fog，背景和雾保持场景原来的值。
 */
export function CubeProbe({ floorId }: { floorId: string }) {
  const scene = useThree((state) => state.scene)
  const [placement, setPlacement] = useState<ProbePlacement | null>(null)

  useLayoutEffect(() => {
    let timer = 0
    let cancelled = false
    const look = () => {
      if (cancelled) return
      const interior = scene.getObjectByName('FloorInterior') as ProbeNode | undefined
      if (!interior) {
        timer = window.setTimeout(look, 200)
        return
      }
      const glass = pickRoomGlass(interior)
      const next = glass ? placementOf(glass as Object3D, floorId) : null
      setPlacement((prev) => (samePlacement(prev, next) ? prev : next))
    }
    look()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [floorId, scene])

  if (!placement) return null
  return <BakeOnce placement={placement} />
}

function samePlacement(prev: ProbePlacement | null, next: ProbePlacement | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  return prev.id === next.id && prev.far === next.far && prev.position[0] === next.position[0] && prev.position[1] === next.position[1] && prev.position[2] === next.position[2]
}

function BakeOnce({ placement }: { placement: ProbePlacement }) {
  return (
    <CubeCamera
      name="CubeProbe"
      frames={1}
      resolution={CUBE_PROBE_RESOLUTION}
      near={CUBE_PROBE_NEAR}
      far={placement.far}
      position={placement.position}
    >
      {(texture) => <ApplyOnce texture={texture} placement={placement} />}
    </CubeCamera>
  )
}

function ApplyOnce({ texture, placement }: { texture: Texture; placement: ProbePlacement }) {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const armed = useRef(false)
  const restore = useRef<(() => void) | null>(null)

  const arm = () => {
    if (armed.current) return
    const stop = armCubeUpdate(scene, placement.mesh as never, texture, () => {
      noteCubeBake(placement.meshName, placement.far)
      invalidate()
    })
    if (!stop) return
    armed.current = true
    restore.current = stop
  }

  useLayoutEffect(() => {
    arm()
    invalidate()
    return () => {
      restore.current?.()
      restore.current = null
      armed.current = false
    }
  }, [invalidate, placement, scene, texture])

  useFrame(() => {
    arm()
  }, 1)

  return null
}
