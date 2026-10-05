import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'

/** 看不见的拾取体（如 B1Pick）。应用点击射线开这层，测量射线不开。 */
export const PICK_VOLUME_LAYER = 1

export function EnablePickVolumeRaycast() {
  const raycaster = useThree((state) => state.raycaster)
  useLayoutEffect(() => {
    raycaster.layers.enable(PICK_VOLUME_LAYER)
  }, [raycaster])
  return null
}
