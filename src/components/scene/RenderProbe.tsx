import { useFrame } from '@react-three/fiber'
import { useEffect } from 'react'

export function RenderProbe() {
  useEffect(() => {
    window.__twinReady = true
    return () => {
      window.__twinReady = false
    }
  }, [])

  useFrame(({ gl }) => {
    window.__twinStats = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    }
  })

  return null
}
