import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { useTwinStore } from '../../store/store'

const projected = new Vector3()

export function RenderProbe() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    window.__twinReady = true
    window.__twinReadyAt = performance.now()
    window.__twinProject = (x, y, z) => {
      const rect = gl.domElement.getBoundingClientRect()
      projected.set(x, y, z).project(camera)
      return {
        x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
        behind: projected.z > 1,
      }
    }
    const unsubscribe = useTwinStore.subscribe((state) => {
      window.__twinFly = state.floorFlyRequest
    })
    return () => {
      window.__twinReady = false
      delete window.__twinReadyAt
      delete window.__twinFirstFrameAt
      delete window.__twinFirstFrameUnixMs
      unsubscribe()
    }
  }, [camera, gl])

  useFrame(() => {
    if (window.__twinFirstFrameAt == null) {
      window.__twinFirstFrameAt = performance.now()
      window.__twinFirstFrameUnixMs = Date.now()
    }
    window.__twinStats = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    }
  })

  return null
}
