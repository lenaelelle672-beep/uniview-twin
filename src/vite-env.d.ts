/// <reference types="vite/client" />

interface TwinRenderStats {
  calls: number
  triangles: number
}

interface TwinInteriorStats {
  floorId: string
  dataDesks: number
  renderedDesks: number
}

interface TwinCutStats {
  hidden: string[]
  visibleShells: number
  roofVisible: boolean
  aboveGradeVisible: boolean
}

interface Window {
  __twinReady?: boolean
  __twinStats?: TwinRenderStats
  __twinInterior?: TwinInteriorStats
  __twinCut?: TwinCutStats
}
