/// <reference types="vite/client" />

declare module 'troika-three-text' {
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null
    unicodeFontsURL?: string | null
    useWorker?: boolean
  }): void
}

interface TwinRenderStats {
  calls: number
  triangles: number
}

interface TwinInteriorStats {
  floorId: string
  dataDesks: number
  renderedDesks: number
  jsonDesks?: number
  jsonColumns?: number
  walkPaths?: number
  labels?: number
  jsonOfficeDesks?: number
  renderedOfficeDesks?: number
  error?: string
}

interface TwinLabelPx {
  fontSize: number
  px: number
  minPx: number
  maxPx: number
  distance: number
}

interface TwinFloorProbe {
  floorId: string
  desks: Array<{ id: string; x: number; z: number; rot: number }>
  columns: Array<{ id: string; x: number; z: number; w: number; d: number }>
  cores: Array<{ id: string; x: number; z: number; polygon: Array<[number, number]> }>
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
  __twinReadyAt?: number
  __twinSuspenseReady?: boolean
  __twinHdrRequired?: boolean
  __twinHdrLoadedAt?: number
  __twinHdrLoadedUnixMs?: number
  __twinHdrReadyAt?: number
  __twinHdrReadyUnixMs?: number
  __twinFirstFrameAt?: number
  __twinFirstFrameUnixMs?: number
  __twinPrefetchAt?: number
  __twinPrefetchUnixMs?: number
  __twinScene?: import('three').Scene
  __twinStats?: TwinRenderStats
  __twinBadges?: number
  __twinBadgeCenters?: Array<{ id: string; x: number; y: number; z: number }>
  __twinFly?: { floorId: string; nonce: number } | null
  __twinProject?: (x: number, y: number, z: number) => { x: number; y: number; behind: boolean }
  __twinInterior?: TwinInteriorStats
  __twinLabelPx?: TwinLabelPx
  __twinLabelPackMs?: number
  __twinFloor?: TwinFloorProbe
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
