import { useLayoutEffect, useRef, useState } from 'react'
import { OrthographicCamera } from '@react-three/drei/core/OrthographicCamera'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3 } from 'three'
import type { Object3D, OrthographicCamera as OrthoCamera } from 'three'
import { pausePlanRig, resumePlanRig, type PlanRig } from './hold'
import { frameFloorPlan, sameFrame, type FloorPlanFrame } from './plan'

/**
 * T118：drei OrthographicCamera 作为单层平面图的默认相机。
 * makeDefault 只在这块挂上时换掉 R3F 的当前相机，卸下时把原来的透视相机还回去。
 * 不创建轨道控制器，也不去摆那台透视机位。
 * 楼板盒和缩放在本地算。北（-Z）朝屏幕上方。
 * drei 这份组件会顺带分配一张 256² 的离屏目标；不把 children 写成函数，它就不会往那张目标上多画一次。
 */

function rigOf(): PlanRig | null {
  return (window.__twinRig as PlanRig | undefined) ?? null
}

function measureFrame(scene: Object3D, width: number, height: number): FloorPlanFrame | null {
  const plate = scene.getObjectByName('FloorPlate')
  if (!plate) return null
  plate.updateWorldMatrix(true, true)
  const box = new Box3().setFromObject(plate)
  if (box.isEmpty()) return null
  return frameFloorPlan(
    {
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
      minZ: box.min.z,
      maxZ: box.max.z,
    },
    width,
    height,
  )
}

function Live({ frame, mask }: { frame: FloorPlanFrame; mask: number }) {
  const ref = useRef<OrthoCamera>(null)
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    const plan = window.__twinFloorPlan
    if (plan) {
      plan.held = true
      plan.mounted = true
      plan.mode = 'ortho'
      plan.waiting = null
    }
    pausePlanRig(rigOf())
    return () => {
      const current = window.__twinFloorPlan
      if (current) {
        current.held = false
        current.mounted = false
        current.mode = 'perspective'
        current.zoom = null
      }
      resumePlanRig(rigOf())
    }
  }, [])

  useLayoutEffect(() => {
    const camera = ref.current
    if (!camera) return
    camera.layers.mask = mask
    camera.up.set(frame.upX, frame.upY, frame.upZ)
    camera.position.set(frame.x, frame.y, frame.z)
    camera.lookAt(frame.targetX, frame.targetY, frame.targetZ)
    camera.zoom = frame.zoom
    camera.near = frame.near
    camera.far = frame.far
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const plan = window.__twinFloorPlan
    if (plan) plan.zoom = frame.zoom
    invalidate()
  }, [frame, invalidate, mask])

  useFrame(() => {
    window.__twinFloorPlanSync?.()
  })

  return (
    <OrthographicCamera
      ref={ref}
      makeDefault
      position={[frame.x, frame.y, frame.z]}
      zoom={frame.zoom}
      near={frame.near}
      far={frame.far}
      up={[frame.upX, frame.upY, frame.upZ]}
    />
  )
}

export function FloorPlanCamera({ floorId }: { floorId: string }) {
  const scene = useThree((state) => state.scene)
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  const active = useThree((state) => state.camera)
  const mask = useRef<number | null>(null)
  if (mask.current == null) mask.current = active.layers.mask
  const [frame, setFrame] = useState<FloorPlanFrame | null>(null)
  const missing = useRef(true)

  useLayoutEffect(() => {
    missing.current = true
    const next = measureFrame(scene, width, height)
    if (next) missing.current = false
    setFrame((prev) => (sameFrame(prev, next) ? prev : next))
    const plan = window.__twinFloorPlan
    if (plan) plan.waiting = next ? null : 'plate'
  }, [floorId, height, scene, width])

  useFrame(() => {
    if (!missing.current) return
    const next = measureFrame(scene, width, height)
    if (!next) return
    missing.current = false
    setFrame((prev) => (sameFrame(prev, next) ? prev : next))
  })

  if (!frame || mask.current == null) return null
  return <Live frame={frame} mask={mask.current} />
}
