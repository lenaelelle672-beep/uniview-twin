import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export function LocalEnvironment({ enabled }: { enabled: boolean }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useLayoutEffect(() => {
    if (!enabled) {
      scene.environment = null
      return
    }
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    scene.environment = target.texture
    return () => {
      if (scene.environment === target.texture) scene.environment = null
      target.texture.dispose()
      pmrem.dispose()
      room.traverse((child) => {
        const mesh = child as { geometry?: { dispose(): void }; material?: { dispose(): void } }
        mesh.geometry?.dispose()
        mesh.material?.dispose()
      })
    }
  }, [enabled, gl, scene])

  return null
}
