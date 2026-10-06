import { Line } from '@react-three/drei/core/Line'
import { useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useRef, useState } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { resolveWorkstationRef } from '../../locate/ref'
import { useTwinStore } from '../../store/store'
import {
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  labelFadeForTarget,
  roomLabelCharacters,
  worldFontSizeForDistance,
  type RoomLabel,
} from './roomLabels'
import { workstationPosition } from './workstationPosition'

const BatchedRoomLabels = lazy(async () => {
  const mod = await import('./textRuntime')
  return { default: mod.BatchedRoomLabels }
})

const sample = new Vector3()
const deskSample = new Vector3()

export function RoomLabels({ floorId, labels }: { floorId: string; labels: RoomLabel[] }) {
  const { camera, scene, size } = useThree()
  const [fontSize, setFontSize] = useState(0.78)
  const pxRef = useRef(0)
  const fadesRef = useRef<number[]>([])
  const characters = roomLabelCharacters(labels)
  const points = labels.flatMap((label) => [label.anchor, label.label])

  useFrame(() => {
    if (labels.length === 0) return
    const perspective = camera as PerspectiveCamera
    let nearest = Infinity
    for (const label of labels) {
      sample.set(label.label[0], label.label[1], label.label[2])
      nearest = Math.min(nearest, camera.position.distanceTo(sample))
    }
    const next = worldFontSizeForDistance(nearest, size.height, perspective.fov, LABEL_MIN_PX, LABEL_MAX_PX)
    if (Math.abs(next - fontSize) > 0.04) setFontSize(next)
    const worldPerPx = (2 * Math.tan((perspective.fov * Math.PI) / 360) * nearest) / size.height
    const px = next / worldPerPx
    pxRef.current = px
    const focused = useTwinStore.getState().focusedDeskId
    const target = focused ? resolveWorkstationRef(focused) : null
    const interior = scene.getObjectByName('FloorInterior')
    let deskX = NaN
    let deskY = NaN
    if (target && target.floorId === floorId && interior) {
      try {
        const place = workstationPosition(target.floorId, target.deskId)
        deskSample.set(place.x, 0.55, place.z)
        interior.localToWorld(deskSample)
        deskSample.project(perspective)
        deskX = (deskSample.x * 0.5 + 0.5) * size.width
        deskY = (-deskSample.y * 0.5 + 0.5) * size.height
      } catch {
        deskX = NaN
      }
    }
    const fades = fadesRef.current
    fades.length = labels.length
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i]
      if (!label || !Number.isFinite(deskX) || !interior) {
        fades[i] = 1
        continue
      }
      sample.set(label.label[0], label.label[1], label.label[2])
      interior.localToWorld(sample)
      sample.project(perspective)
      fades[i] = labelFadeForTarget(
        { x: (sample.x * 0.5 + 0.5) * size.width, y: (-sample.y * 0.5 + 0.5) * size.height },
        { x: deskX, y: deskY },
        px,
      )
    }
    window.__twinLabelPx = {
      fontSize: next,
      px,
      minPx: LABEL_MIN_PX,
      maxPx: LABEL_MAX_PX,
      distance: nearest,
    }
  })

  if (labels.length === 0) return null
  const outline = Math.max(0.03, fontSize * 0.055)
  return (
    <group name="RoomLabels">
      <Line points={points} segments color="#5c6b7c" lineWidth={1.5} />
      <Suspense fallback={null}>
        <BatchedRoomLabels
          floorId={floorId}
          labels={labels}
          fontSize={fontSize}
          outlineWidth={outline}
          characters={characters}
          fadesRef={fadesRef}
        />
      </Suspense>
    </group>
  )
}
