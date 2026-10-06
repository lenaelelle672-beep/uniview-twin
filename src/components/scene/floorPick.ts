import type { ThreeEvent } from '@react-three/fiber'
import { useTwinStore } from '../../store/store'

export function useFloorActions(floorId: string) {
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const emitFloorFly = useTwinStore((state) => state.emitFloorFly)
  const enterFloor = useTwinStore((state) => state.enterFloor)

  const select = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 2) return
    event.stopPropagation()
    setSelectedFloor(floorId)
  }

  return {
    onClick: select,
    onDoubleClick: (event: ThreeEvent<MouseEvent>) => {
      if (event.delta > 2) return
      event.stopPropagation()
      emitFloorFly(floorId)
      enterFloor(floorId)
    },
  }
}
