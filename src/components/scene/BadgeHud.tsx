import { Hud } from '@react-three/drei/core/Hud'
import { FloorBadges } from './FloorBadges'

export default function BadgeHud() {
  return (
    <Hud renderPriority={3}>
      <FloorBadges />
    </Hud>
  )
}
