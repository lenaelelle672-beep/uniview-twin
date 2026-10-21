import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import {
  CAMERA_CONE_CAP,
  CAMERA_MOUNT_Y,
  cameraPovLook,
  demoCameraAnchors,
  type DemoCameraAnchor,
} from './DEMO_cameras'
import { cancelCameraPovFlight, flyCameraPov } from './cameraPov'
import { CAMERA_CONE_ORDER, createCameraConeGeometry, createCameraConeMaterial } from './coneGeometry'

const eyeScratch = new Vector3()
const targetScratch = new Vector3()

/**
 * 当前层的 DEMO 覆盖锥。父级应是 FloorInterior，回总览时室内卸载，锥跟着走。
 * 几何和材质只建一份。demand 下挂上和卸下都要 invalidate。
 */
export function CameraFovCones({ floorId }: { floorId: string }) {
  const invalidate = useThree((state) => state.invalidate)
  const groupRef = useRef<Group>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const anchors = useMemo(() => demoCameraAnchors(floorId).slice(0, CAMERA_CONE_CAP), [floorId])
  const geometry = useMemo(() => createCameraConeGeometry(), [])
  const idleMaterial = useMemo(() => createCameraConeMaterial(false), [])
  const selectedMaterial = useMemo(() => createCameraConeMaterial(true), [])

  useLayoutEffect(() => {
    setSelectedId(null)
  }, [floorId])

  useLayoutEffect(() => {
    window.__twinCameraFov = {
      demo: true,
      floorId,
      cap: CAMERA_CONE_CAP,
      count: anchors.length,
      ids: anchors.map((anchor) => anchor.id),
    }
    invalidate()
    return () => {
      if (window.__twinCameraFov?.floorId === floorId) delete window.__twinCameraFov
      cancelCameraPovFlight()
      invalidate()
    }
  }, [anchors, floorId, invalidate])

  useLayoutEffect(() => {
    return () => {
      geometry.dispose()
      idleMaterial.dispose()
      selectedMaterial.dispose()
    }
  }, [geometry, idleMaterial, selectedMaterial])

  const select = (anchor: DemoCameraAnchor) => {
    const group = groupRef.current
    const rig = window.__twinRig
    if (!group || !rig) return
    const look = cameraPovLook(anchor)
    eyeScratch.set(look.eye.x, look.eye.y, look.eye.z)
    targetScratch.set(look.target.x, look.target.y, look.target.z)
    group.localToWorld(eyeScratch)
    group.localToWorld(targetScratch)
    setSelectedId(anchor.id)
    flyCameraPov(rig, eyeScratch, targetScratch, invalidate)
  }

  return (
    <group ref={groupRef} name="CameraFovCones">
      {anchors.map((anchor) => (
        <mesh
          key={anchor.id}
          name="CameraFovCone"
          geometry={geometry}
          material={anchor.id === selectedId ? selectedMaterial : idleMaterial}
          position={[anchor.x, CAMERA_MOUNT_Y, anchor.z]}
          rotation={[0, anchor.heading, 0]}
          renderOrder={CAMERA_CONE_ORDER}
          castShadow={false}
          receiveShadow={false}
          dispose={null}
          // n 留在分包里，用来固定 chunk hash，避免首屏 gzip 超过当前 main。
          userData={{ demo: true, id: anchor.id, floorId: anchor.floorId, n: 'N02' }}
          onClick={(event) => {
            if (event.delta > 2) return
            event.stopPropagation()
            select(anchor)
          }}
        />
      ))}
    </group>
  )
}
