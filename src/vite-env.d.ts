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

interface TwinSlabMetrics {
  floorId: string
  widthRatio: number
  heightRatio: number
  centerX: number
  centerY: number
  minY: number
  maxY: number
}

interface TwinLocateMetrics {
  ms: number
  flyMs: number
  deskId: string
}

interface TwinExplodeFloor {
  id: string
  offset: number
  groupY: number | null
  bottom: number
  top: number
}

interface TwinExplodeStats {
  progress: number
  exploded: boolean
  gap: number
  overlap: boolean
  floors: TwinExplodeFloor[]
}

interface Window {
  __twinReady?: boolean
  __twinStats?: TwinRenderStats
  __twinBadges?: number
  __twinBadgeCenters?: Array<{ id: string; x: number; y: number; z: number }>
  __twinFly?: { floorId: string; nonce: number } | null
  __twinProject?: (x: number, y: number, z: number) => { x: number; y: number; behind: boolean }
  __twinInterior?: TwinInteriorStats
  __twinCut?: TwinCutStats
  __twinRig?: {
    minDistance: number
    maxDistance: number
    distance: number
    polarAngle: number
    maxPolarAngle: number
    minPolarAngle: number
    camera: { fov: number; position: import('three').Vector3; updateProjectionMatrix: () => void }
    rotatePolarTo: (polarAngle: number, enableTransition?: boolean) => Promise<void>
    rotateTo: (azimuthAngle: number, polarAngle: number, enableTransition?: boolean) => Promise<void>
    dollyTo: (distance: number, enableTransition?: boolean) => Promise<void>
    setTarget: (x: number, y: number, z: number, enableTransition?: boolean) => Promise<void>
    setLookAt: (
      x: number,
      y: number,
      z: number,
      tx: number,
      ty: number,
      tz: number,
      enableTransition?: boolean,
    ) => Promise<void>
    setBoundary: (box: import('three').Box3 | null) => void
    getPosition: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    getTarget: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    update: (delta: number) => boolean
  }
  __twinSlab?: TwinSlabMetrics
  __twinLocate?: TwinLocateMetrics
  __twinHighlight?: string
  __twinFlyEnd?: { deskId: string; x: number; y: number; z: number; started: number }
  __twinExplode?: TwinExplodeStats
}
