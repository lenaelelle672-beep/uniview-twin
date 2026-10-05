import { Billboard } from '@react-three/drei/core/Billboard'
import { Line } from '@react-three/drei/core/Line'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { LazyText } from './lazyTroikaText'
import {
  LABEL_MAX_PX,
  LABEL_MIN_PX,
  roomLabelCharacters,
  ROOM_LABEL_FONT,
  worldFontSizeForDistance,
  type RoomLabel,
} from './roomLabels'

const sample = new Vector3()

export function RoomLabels({ labels }: { labels: RoomLabel[] }) {
  const { camera, size } = useThree()
  const [fontSize, setFontSize] = useState(0.78)
  const pxRef = useRef(0)
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
    const next = worldFontSizeForDistance(nearest, size.height, perspective.fov, LABEL_MIN_PX)
    if (Math.abs(next - fontSize) > 0.04) setFontSize(next)
    const worldPerPx = (2 * Math.tan((perspective.fov * Math.PI) / 360) * nearest) / size.height
    const px = next / worldPerPx
    pxRef.current = px
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
      {labels.map((label) => (
        <Billboard key={label.id} position={label.label}>
          <LazyText
            font={ROOM_LABEL_FONT}
            characters={characters}
            fontSize={fontSize}
            color="#17324d"
            outlineWidth={outline}
            outlineColor="#f7f4ee"
            anchorX="center"
            anchorY="middle"
            renderOrder={3}
          >
            {label.text}
          </LazyText>
        </Billboard>
      ))}
    </group>
  )
}
