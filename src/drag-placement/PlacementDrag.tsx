import { DragControls } from '@react-three/drei/web/DragControls'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Vector2, type Group } from 'three'
import { claimDragCamera, dragCameraHeld, releaseDragCamera, type DragCamera } from './latch'
import {
  DRAG_AXIS,
  DRAG_SPOTS,
  cloneFromHandle,
  closestHitIsPlacement,
  dragAcceptsPointer,
  dragLimitsFor,
  eventTargetsCanvas,
  handleOf,
  readMatrixPosition,
  type DragSpot,
  type Vec3,
} from './plan'
import { commitPlace, placeOf, placementMap, setDragFlags } from './session'

/**
 * T080 落点拖摆。drei DragControls 只出现在这个懒包里。
 * 拖的时候锁 CameraControls。Shift 让给 T052 框选。落点拖在水平面上，不走轴柄。
 */

const DEVICE_COLOR = '#3d7dff'
const FURNITURE_COLOR = '#d8a15a'
const pointerNdc = new Vector2()

type HitObject = { userData?: { dragPlacement?: boolean } }
type CloneChild = {
  position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
  updateMatrix: () => void
}

function controlsOf(value: unknown): DragCamera | null {
  if (!value || typeof value !== 'object') return null
  return value as DragCamera
}

function usePlacementLatch() {
  const controls = useThree((state) => state.controls)
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const raycaster = useThree((state) => state.raycaster)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const canvas = gl.domElement
    const rig = () => controlsOf(controls)
    const onDown = (event: PointerEvent) => {
      if (!dragAcceptsPointer(event)) return
      if (!eventTargetsCanvas(event, canvas)) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointerNdc, camera)
      const hits = raycaster.intersectObject(scene, true)
      if (!closestHitIsPlacement(hits.map((hit) => hit.object as HitObject))) return
      // 捕获阶段早于 DragControls。这时 enabled 还是按下前的值。
      if (claimDragCamera(rig())) setDragFlags({ latched: true })
    }
    // 冒泡晚于画布上的 pointerup。若 onDragEnd 已经交还，这里是空操作。
    const onUp = () => {
      if (!dragCameraHeld(rig())) return
      releaseDragCamera(rig())
      setDragFlags({ latched: false })
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (releaseDragCamera(rig())) setDragFlags({ latched: false, dragging: false })
    }
  }, [camera, controls, gl, raycaster, scene])
}

function syncClones(scene: { getObjectByName: (name: string) => unknown }): boolean {
  const root = scene.getObjectByName('FragmentClones') as { children?: CloneChild[] } | undefined
  if (!root?.children) return false
  const places = placementMap()
  let changed = false
  let index = 0
  for (const spot of DRAG_SPOTS) {
    if (spot.kind !== 'furniture' || !spot.clone) continue
    const child = root.children[index]
    index += 1
    if (!child) continue
    const handle = places.get(spot.id) ?? handleOf(spot)
    const next = cloneFromHandle(handle, handleOf(spot), spot.clone)
    if (
      Math.abs(child.position.x - next.x) < 1e-4 &&
      Math.abs(child.position.y - next.y) < 1e-4 &&
      Math.abs(child.position.z - next.z) < 1e-4
    ) {
      continue
    }
    child.position.set(next.x, next.y, next.z)
    child.updateMatrix()
    changed = true
  }
  return changed
}

function PlacementHandle({ spot }: { spot: DragSpot }) {
  const ref = useRef<Group>(null)
  const controls = useThree((state) => state.controls)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [place, setPlace] = useState<Vec3>(() => placeOf(spot.id))
  const meshY = spot.kind === 'device' ? 0.55 : 0.08
  const args: [number, number, number] = spot.kind === 'device' ? [0.62, 1.1, 0.62] : [1.35, 0.16, 1.35]

  useLayoutEffect(() => {
    const group = ref.current
    if (!group) return
    group.name = spot.kind === 'device' ? 'DragDevice' : 'DragFurniture'
    group.position.set(place.x, place.y, place.z)
    group.updateMatrix()
    group.updateMatrixWorld(true)
  }, [place.x, place.y, place.z, spot.kind])

  const follow = (next: Vec3, commitReact: boolean) => {
    commitPlace(spot.id, next)
    if (commitReact) setPlace(next)
    if (syncClones(scene)) {
      invalidate()
      void window.__twinInvalidate?.()
    }
  }

  return (
    <DragControls
      ref={ref}
      axisLock={DRAG_AXIS}
      autoTransform
      dragLimits={dragLimitsFor(spot.handle[1])}
      onDragStart={() => {
        setDragFlags({ dragging: true, latched: true })
      }}
      onDrag={(matrix) => {
        follow(readMatrixPosition(matrix), false)
      }}
      onDragEnd={() => {
        const group = ref.current
        if (group) follow(readMatrixPosition(group.matrix), true)
        // drei 刚刚把 enabled 写成 true。只交还我们按下时记下的那一档。
        releaseDragCamera(controlsOf(controls))
        setDragFlags({ dragging: false, latched: false })
      }}
    >
      <mesh
        position={[0, meshY, 0]}
        userData={{ dragPlacement: true, kind: spot.kind, id: spot.id }}
        castShadow={false}
        receiveShadow={false}
        frustumCulled={false}
        onPointerDown={(event) => {
          if (!dragAcceptsPointer(event)) event.stopPropagation()
        }}
      >
        <boxGeometry args={args} />
        <meshBasicMaterial color={spot.kind === 'device' ? DEVICE_COLOR : FURNITURE_COLOR} toneMapped={false} />
      </mesh>
    </DragControls>
  )
}

export function PlacementDrag() {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  usePlacementLatch()

  useLayoutEffect(() => {
    setDragFlags({ mounted: true })
    if (syncClones(scene)) invalidate()
    invalidate()
    void window.__twinInvalidate?.()
    return () => {
      setDragFlags({ mounted: false, dragging: false, latched: false })
      invalidate()
      void window.__twinInvalidate?.()
    }
  }, [invalidate, scene])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!syncClones(scene)) return
      invalidate()
      void window.__twinInvalidate?.()
    }, 400)
    return () => window.clearInterval(id)
  }, [invalidate, scene])

  return (
    <group name="PlacementDrag">
      {DRAG_SPOTS.map((spot) => (
        <PlacementHandle key={spot.id} spot={spot} />
      ))}
    </group>
  )
}
