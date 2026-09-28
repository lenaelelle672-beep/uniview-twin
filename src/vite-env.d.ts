/// <reference types="vite/client" />

interface TwinRenderStats {
  calls: number
  triangles: number
}

interface Window {
  __twinReady?: boolean
  __twinStats?: TwinRenderStats
}
