import { Billboard, Line, Text } from '@react-three/drei'
import { roomLabelCharacters, ROOM_LABEL_FONT, type RoomLabel } from './roomLabels'

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
