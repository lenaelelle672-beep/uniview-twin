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

interface TwinSampleBox {
  x: number
  y: number
  w: number
  h: number
}

interface TwinMonitorBoxes {
  floorId: string
  canvas: { width: number; height: number }
  alarm: { deskId: string; box: TwinSampleBox; patches?: Array<{ name: string; box: TwinSampleBox }> } | null
  online: { deskId: string; box: TwinSampleBox; patches?: Array<{ name: string; box: TwinSampleBox }> } | null
}

interface TwinFacadeBoxes {
  selectedFloor: string
  neighborFloor: string
  canvas: { width: number; height: number }
  selected: TwinSampleBox
  neighbor: TwinSampleBox
}

interface TwinEnvMaterial {
  key: string
  name: string
  matched: boolean
  envMapIntensity: number
  hasEnvMap: boolean
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
  __twinTreeLoReadyAt?: number
  __twinFirstFrameAt?: number
  __twinFirstFrameUnixMs?: number
  __twinPrefetchAt?: number
  __twinPrefetchUnixMs?: number
  __twinScene?: import('three').Scene
  __twinSelected?: string | null
  __twinView?: string
  __twinDevices?: Array<{ id: string; deskId?: string; floorId: string; type: string; status: string }>
  __twinFocusDevice?: (target: { floor: string; deskId: string | null; deviceId?: string | null }) => void
  __twinSelectFloor?: (floorId: string | null) => void
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
  __twinMonitorBoxes?: TwinMonitorBoxes
  __twinFacadeBoxes?: TwinFacadeBoxes
  __twinSetExploded?: (exploded: boolean) => void
  __twinOverlayBudget?: {
    extraTargets: number
    extraBytes: number
    drawingBuffer: { width: number; height: number }
  }
  __twinGlProbe?: {
    samples: number
    errors: number[]
    samplesReliableOnSwiftShader: boolean
  }
  __twinMemory?: {
    textures: number
    geometries: number
    programs: number
  }
  __twinTargetInventory?: {
    width: number
    height: number
    items: Array<{ name: string; width: number; height: number; format: string; samples: number; bytes: number }>
    bytes: number
    mib: number
  }
  __twinBlitSites?: ReadonlyArray<{ file: string; fn: string; dest: string }>
  __twinComposerLive?: boolean
  __twinPrewarmed?: boolean
  __twinPrewarmStartedAt?: number
  __twinPrewarmedAt?: number
  __twinPrewarm?: {
    startedAt: number
    doneAt: number
    totalMs: number
    shaderMs: number
    fontMs: number
    groups: string[]
    yielded: number
    quality: string
    parallelShaderCompile: boolean
    programsBefore: number
    programsAfter: number
    textRuntimeFirst: boolean
  }
  __twinWarmup?: {
    compileMs: number
    totalMs: number
    firstSwitch: boolean
  }
  __twinFrameWatch?: {
    active: boolean
    frames: Array<{
      at: number
      width: number
      height: number
      emptyRatio: number
      darkRatio: number
      buildingRatio?: number
      badgeOnly?: boolean
      freezeUp?: boolean
      empty: boolean
    }>
    scratch?: HTMLCanvasElement
    scratchCtx?: CanvasRenderingContext2D | null
  }
  __twinEnvMaterials?: TwinEnvMaterial[]
  __twinGrille?: Array<{ name: string; type: string; visible: boolean; world: number[]; box: number[] | null }>
  __twinRaycast?: (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ) => Array<{ name: string; parent: string; distance: number; point: number[] }>
  __twinCanvasProject?: (x: number, y: number, z: number) => { x: number; y: number; behind: boolean }
  __twinPick?: (
    cx: number,
    cy: number,
  ) => { name: string; parent: string; material: string; distance: number; point: [number, number, number] } | null
}
