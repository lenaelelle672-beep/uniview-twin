import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Vector3 } from 'three'
import { markSuspenseReady, resetOverviewReadyMarks } from '../../scene/overviewReady'
import { useTwinStore } from '../../store/store'

const projected = new Vector3()

export function RenderProbe() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    markSuspenseReady()
    window.__twinScene = scene
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
      resetOverviewReadyMarks()
      unsubscribe()
    }
  }, [camera, gl, scene])

  useFrame(() => {
    if (window.__twinReady && window.__twinFirstFrameAt == null) {
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
