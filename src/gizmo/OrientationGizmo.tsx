import { GizmoHelper } from '@react-three/drei/core/GizmoHelper'
import { GizmoViewcube } from '@react-three/drei/core/GizmoViewcube'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { useTwinStore } from '../store/store'
import {
  GIZMO_FACES,
  GIZMO_FONT,
  GIZMO_RENDER_PRIORITY,
  NORTH_FACE,
  directionFromGizmoClick,
  lookOffset,
} from './faces'
import { cancelAxisFlight, flyToAxis } from './flyAxis'

const eyeScratch = new Vector3()
const targetScratch = new Vector3()

/**
 * 总览辨北。GizmoViewcube 的 onClick 换掉内部 tweenCamera：
 * 那条路径每帧 setPosition 且不带动画，会绕开 T032。
 * 这里只复用 makeDefault 的 CameraControls.setLookAt(..., true)。
 */
export function OrientationGizmo() {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    window.__twinGizmo = {
      view: 'building',
      faces: GIZMO_FACES,
      north: NORTH_FACE,
      renderPriority: GIZMO_RENDER_PRIORITY,
    }
    invalidate()
    return () => {
      cancelAxisFlight()
      delete window.__twinGizmo
    }
  }, [invalidate])

  const onAxisClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    const rig = window.__twinRig
    if (!rig || window.__vpH || window.__vpT) return null
    if (useTwinStore.getState().view !== 'building') return null
    const normal = event.face?.normal
    const position = event.object.position
    const direction = directionFromGizmoClick({
      objectX: position.x,
      objectY: position.y,
      objectZ: position.z,
      normalX: normal?.x,
      normalY: normal?.y,
      normalZ: normal?.z,
    })
    if (!direction) return null
    rig.getPosition(eyeScratch, false)
    rig.getTarget(targetScratch, false)
    const fallbackAzimuth = Math.atan2(eyeScratch.x - targetScratch.x, eyeScratch.z - targetScratch.z)
    const offset = lookOffset(direction, eyeScratch.distanceTo(targetScratch), fallbackAzimuth)
    flyToAxis(
      rig,
      {
        x: targetScratch.x + offset.x,
        y: targetScratch.y + offset.y,
        z: targetScratch.z + offset.z,
      },
      { x: targetScratch.x, y: targetScratch.y, z: targetScratch.z },
      invalidate,
      () => useTwinStore.getState().view === 'building' && !window.__vpH && !window.__vpT,
    )
    return null
  }

  return (
    <GizmoHelper alignment="bottom-right" margin={[80, 80]} renderPriority={GIZMO_RENDER_PRIORITY}>
      <GizmoViewcube
        faces={[...GIZMO_FACES]}
        font={GIZMO_FONT}
        color="#f4f1ea"
        hoverColor="#d7e4f4"
        textColor="#122033"
        strokeColor="#243044"
        onClick={onAxisClick}
      />
    </GizmoHelper>
  )
}
