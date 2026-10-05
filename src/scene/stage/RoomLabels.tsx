import { Billboard } from '@react-three/drei/core/Billboard'
import { Line } from '@react-three/drei/core/Line'
import { Text } from '@react-three/drei/core/Text'
import { disableTroikaCdnFallback } from './disableTroikaCdn'
import { roomLabelCharacters, ROOM_LABEL_FONT, type RoomLabel } from './roomLabels'

disableTroikaCdnFallback()

export function RoomLabels({ labels }: { labels: RoomLabel[] }) {
  const characters = roomLabelCharacters(labels)
  const points = labels.flatMap((label) => [label.anchor, label.label])
  return (
    <group name="RoomLabels">
      <Line points={points} segments color="#5c6b7c" lineWidth={1.5} />
      {labels.map((label) => (
        <Billboard key={label.text} position={label.label}>
          <Text
            font={ROOM_LABEL_FONT}
            characters={characters}
            fontSize={0.78}
            color="#17324d"
            outlineWidth={0.045}
            outlineColor="#f7f4ee"
            anchorX="center"
            anchorY="middle"
            renderOrder={3}
          >
            {label.text}
          </Text>
        </Billboard>
      ))}
    </group>
  )
}
