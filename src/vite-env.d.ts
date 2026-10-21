/// <reference types="vite/client" />

declare module '*.css?inline' {
  const css: string
  export default css
}

declare module 'troika-three-text' {
  export function configureTextBuilder(config: {
    defaultFontURL?: string | null
    unicodeFontsURL?: string | null
    useWorker?: boolean
    sdfGlyphSize?: number
  }): void
  export function preloadFont(
    options: { font?: string; characters?: string; sdfGlyphSize?: number },
    callback: (info?: { sdfTexture?: import('three').Texture }) => void,
  ): void
  export function getTextRenderInfo(
    args: { font?: string; text?: string; sdfGlyphSize?: number; lang?: string },
    callback: (info: { sdfTexture?: { image?: { width?: number; height?: number } } }) => void,
  ): void
}

interface TwinLabelPackMs {
  sdf: number
  layout: number
  sync: number
  total: number
}

interface TwinLabelMount {
  floorId: string
  mounted: number
  total: number
  priorityIds: string[]
  firstBatchIds: string[]
  mountedIds: string[]
  done: boolean
}

interface TwinRenderStats {
  calls: number
  triangles: number
  frame?: number
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

interface TwinLabelD243Row {
  id: string
  text: string
  wx: number
  wz: number
  sx: number
  sy: number
  w: number
  h: number
  offsetX: number
  offsetY: number
  offsetLen: number
  visible: boolean
  cluster: string | null
}

interface TwinLabelD243 {
  rest: TwinLabelD243Row | null
  corridors: TwinLabelD243Row[]
  nearestWorldM: number | null
  nearestAnchorPx: number | null
  nearestPlacedPx: number | null
  restBoxW: number | null
  corridorBoxW: number | null
  restOffsetLen: number | null
  corridorOffsetLen: number | null
  cause: string
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
  __twinNotePreloadPause?: () => void
  __twinGpu?: {
    renderer: string
    software: boolean
    tier: 'performance' | 'balanced' | 'high'
    softwareAuto?: boolean
    preserveDrawingBuffer?: boolean
    dpr?: number
    probeMs?: number
  }
  __twinInvalidate?: () => Promise<void>
  __twinInvalidateNext?: string
  __twinInvalidateLog?: Array<{ t: number; src: string }>
  __twinInvalidateCounts?: Record<string, number>
  __twinFrameCount?: number
  __twinFrames?: number
  /** floorReadyPoller 第三次稳定采样。shadowBake 只读它关窗。 */
  __twinFloorReadyAt?: number
  __twinGlDebug?: boolean
  __twinLastFrameAt?: number
  __twinGlFrame?: number
  __twinSchedule?: {
    hz: number
    view: string
    quality: string
    hidden: boolean
    holds: { motion: number; people: number; alarm: number }
  }
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
  /** 楼层壳 chunk 开始 import 的时刻。总览应晚于首帧 + FLOOR_SHELL_AFTER_FIRST_MS。 */
  __twinFloorShellAt?: number
  __twinPrefetchUnixMs?: number
  __twinFirstPrefetchDone?: boolean
  __twinFirstPrefetchDoneAt?: number
  __twinTextRuntimeAt?: number
  __twinRenderer?: import('three').WebGLRenderer
  __twinCamera?: import('three').Camera
  __twinTexImage2D?: {
    calls: Array<{
      at: number
      ms: number
      w?: number
      h?: number
      atlas: boolean
      view?: string
      floor?: string | null
      src?: string
    }>
    uploadMs: number
  }
  __twinEntryFrames?: Array<{
    at: number
    dt: number
    view?: string
    floor?: string | null
    rested?: boolean | null
    packStep?: string
    texMs: number
    texCalls: number
    atlasTex: number
    programs?: number | null
    packMs?: number | null
    labelReady?: number | null
  }>
  __twinScene?: import('three').Scene
  __twinSelected?: string | null
  __twinView?: string
  __twinDevices?: Array<{ id: string; deskId?: string; floorId: string; type: string; status: string }>
  __twinFocusDevice?: (target: { floor: string; deskId: string | null; deviceId?: string | null }) => void
  __twinSelectFloor?: (floorId: string | null) => void
  __twinSetDayNight?: (dayNight: 'day' | 'night') => void
  __twinSetQuality?: (quality: 'perf' | 'balanced' | 'high') => void
  __twinStats?: TwinRenderStats
  __twinFloorMarkers?: {
    count: number
    renderedBeforeFirstFrame: boolean
    at: number
  }
  __twinLabelSyncs?: number
  __twinLabelSyncStartedAt?: number
  __twinLabelBatchSyncStartedAt?: number
  __twinLabelBatchSyncAt?: number
  __twinLabelPaintAt?: number
  __twinLabelReadyAt?: number
  __twinFloorFontStartedAt?: number
  __twinFloorFontReadyAt?: number
  __twinFloorFontChunks?: number
  __twinLabelFading?: boolean
  __twinCameraRested?: boolean
  __twinCameraRestReason?: string
  __twinCameraRestAt?: number
  __twinCameraMoveAt?: number
  /** D288：仅 keepDrawingBuffer=1 / probe=1 时写入。阴影贴图补烘。labelShownAt 是出齐时刻。 */
  /** T026：当前赋给 scene.environment 的 HDR。白模或尚未解码时删掉。 */
  __twinEnv?: {
    url: string
    nightMap: boolean
    intensity: number
  }
  /** T024：非 perf 档 drei SoftShadows 挂上之后写入，卸载时删掉。 */
  __twinSoftShadows?: {
    samples: number
    size: number
    focus: number
    at: number
  }
  /** T025：夜景且合成器非 perf 时 Bloom 挂上之后写入，卸载时删掉。 */
  __twinNightBloom?: {
    luminanceThreshold: number
    intensity: number
    radius: number
    mipmapBlur: boolean
    at: number
  }
  __twinShadowBake?: {
    at: number
    reason: string
    rested: boolean
    interior: boolean
    deferred: boolean
    labelShownAt: number | null
    labelReadyAt?: number | null
    labelAnchorAt?: number | null
  }
  __twinShadowBakeLog?: Array<{
    at: number
    phase: string
    reason: string
    ready: boolean
    rested: boolean
    interior: boolean
    cutActive: boolean
    clipping: boolean
    windowClosed?: boolean
  }>
  __twinFlyPromiseAt?: number
  /** D283：仅 keepDrawingBuffer=1 / probe=1 时写入。各层室内几何预热。 */
  __twinInteriorPrewarm?: {
    done?: boolean
    floors?: Record<
      string,
      {
        parseMs: number
        buildMs: number
        compileMs: number
        uploadMs: number
        meshes: number
        uploaded: boolean
      }
    >
    shell?: {
      planes: number
      at: number
      scene: boolean
      timing?: { slot: string; start: number; rows: Array<{ name: string; at: number; ms: number }> }
    }
    mount?: { floorId: string; at: number; reused: boolean; uploaded: boolean }
  }
  __twinCameraFramed?: string
  __twinLabelPhases?: {
    restAt?: number
    restReason?: string
    flyPromiseAt?: number
    avoidStartAt?: number
    avoidMs?: number
    packedAt?: number
    syncStartAt?: number
    syncMs?: number
    syncAt?: number
    fadeStartAt?: number
    fadeDoneAt?: number
    fadeMs?: number
    packStep?: 'idle' | 'avoid' | 'sync' | 'strip' | 'fade'
    syncWaves?: number
    maxFrameAvoid?: number
    maxFrameSync?: number
    maxFrameFade?: number
  }
  __twinGlyphPreload?: {
    batchSize: number
    firstBatchSize: number
    batches: Array<{
      i: number
      chars: number
      ms: number
      maxFrame: number
      seen: number
      floorId?: string
      kind?: string
    }>
    done: boolean
    atlasGrows: Array<{ at: number; msg: string; floorId: string | null; seen: number }>
    unique?: number
    newOnEntry?: Record<string, number>
    atlasHeight?: number | null
    atlasWidth?: number | null
    paused?: boolean
    pauseReason?: 'pointer' | 'motion' | 'floor' | null
    pauseCounts?: { pointer: number; motion: number; floor: number }
    warmup?: Array<{ kind: string; ms: number; maxFrame: number; atlasHeight?: number | null }>
    startedAt?: number
    gate?: {
      firstAt: number | null
      textAt: number | null
      warmup: boolean
      ready: boolean
    }
    uploaded?: boolean
    sdfReady?: boolean
    spaceFetchMs?: number
    fontPrefetch?: {
      at: number
      ms: number
      bytes: number
      afterFirstMs: number | null
      longTaskMs: number
    }
    spaceCall?: {
      at: number
      ms: number
      frameMs: number
      fetchMs?: number
      atlasMs?: number
      parseMs?: number
      atlasFrameMs?: number
      parseFrameMs?: number
      atlasLongTaskMs?: number
      parseLongTaskMs?: number
      longTasks?: Array<{ start: number; dur: number; name: string }>
      canvasMs?: number
      sdfMs?: number
      compileCount?: number
    }
    upload?: { at: number; ms: number; frameMs: number }
    compile?: {
      at: number
      ms: number
      frameMs: number
      programsBefore?: number
      programsAfter?: number
      target?: 'composer' | 'canvas'
    }
    interiorCompile?: {
      at: number
      ms: number
      frameMs: number
      programsBefore?: number
      programsAfter?: number
    }
    shellClip?: boolean
  }
  __twinLabelBatchPresent?: boolean
  __twinLabelOverlap?: {
    merged: number
    hidden: number
    hiddenAfterZoom: number
    overlapPairs: number
    grazePairs?: number
    mismatch?: number
    mismatchIds?: string[]
    maxAngle?: number
    maxOffset: number
    tier2?: { visible: number; total: number; hidden: number }
    measured?: Array<{ id: string; text: string; box: { x: number; y: number; w: number; h: number }; cluster: string | null; px: number }>
    pairs?: Array<[string, string]>
    region?: Array<{ id: string; text: string; box: { x: number; y: number; w: number; h: number }; cluster: string | null; px: number }>
    hiddenAt?: Array<{ id: string; text: string; sx: number; sy: number; w: number; h: number; cluster?: string | null }>
    visible?: Array<{
      id: string
      text: string
      sx: number
      sy: number
      w: number
      h: number
      offsetX: number
      offsetY: number
      cluster: string | null
      wx: number
      wz: number
    }>
    d243?: TwinLabelD243
    hoverId?: string | null
  }
  __twinBadgeCenters?: Array<{ id: string; x: number; y: number; z: number }>
  __twinFly?: { floorId: string; nonce: number } | null
  __twinProject?: (x: number, y: number, z: number) => { x: number; y: number; behind: boolean }
  __twinInterior?: TwinInteriorStats
  __twinLabelPx?: TwinLabelPx
  __twinLabelPackMs?: TwinLabelPackMs | number
  __twinLabelPackDetail?: TwinLabelPackMs
  __twinLabelMount?: TwinLabelMount
  __twinDismissEsc?: () => boolean
  __twinVisibleFocus?: {
    canvas: { left: number; right: number; top: number; bottom: number }
    visible: { left: number; right: number; top: number; bottom: number }
    focal: { x: number; y: number; z: number }
    distance: number
    target?: { x: number; y: number }
  }
  __twinFloor?: TwinFloorProbe
  __twinCut?: TwinCutStats
  __twinRig?: {
    active?: boolean
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
    setFocalOffset?: (x: number, y: number, z: number, enableTransition?: boolean) => Promise<void>
    setBoundary: (box: import('three').Box3 | null) => void
    getPosition: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    getTarget: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    getFocalOffset?: (out: import('three').Vector3, receiveEndValue?: boolean) => import('three').Vector3
    update: (delta: number) => boolean
  }
  /** T041：?vp= 还原期间不要让取景和距离夹紧改掉眼点。 */
  __vpH?: boolean
  /** T041：导览巡游时单层相机不要抢 setLookAt。 */
  __vpT?: boolean
  /** T041：导览在画布外泵一帧。不进 cameraRest / frameSchedule。 */
  __vpP?: () => void
  /** T041：?vp= 还原函数，按需包挂上之前是空的。 */
  __vpS?: (rig: NonNullable<Window['__twinRig']>, token: string, floor: boolean) => void
  __twinSlab?: TwinSlabMetrics
  __twinLocate?: TwinLocateMetrics
  __twinHighlight?: string
  /** T034/T036：当前聚焦工位的青色描边。没有聚焦壳时删掉。 */
  __twinDeskOutline?: {
    floorId: string
    color: string
    names: Array<'DeskOutline' | 'DeviceOutline'>
  }
  /** T036：进层后的告警 / 搜索多描边。卸载或没有载体时删掉。 */
  __twinMultiOutlines?: {
    floorId: string
    cap: number
    count: number
    alarmDeskIds: string[]
    searchDeskIds: string[]
    alarmColor: string
    searchColor: string
  }
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
  __twinComposerInput?: import('three').WebGLRenderTarget | null
  __twinStencilCap?: { shells: number; at: number }
  __twinProgramSnaps?: Record<string, Array<{ name: string; cacheKey: string }>>
  __twinSnapPrograms?: (label: string) => Array<{ name: string; cacheKey: string }>
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
    shaderEnabled: boolean
    glyphsRequired?: number
    glyphsPrewarmed?: number
  }
  __twinShaderCompiles?: Array<{
    kind: 'compileShader' | 'linkProgram'
    at: number
    ms: number
    view?: string
    floor?: string | null
    label: boolean
    batched?: boolean
  }>
  __twinProgramLog?: Array<{
    at: number
    label: string
    programs: number
    view?: string
    floor?: string | null
  }>
  __twinSetSize?: Array<{
    at: number
    w: number
    h: number
    updateStyle: boolean
    view?: string
    floor?: string | null
  }>
  __twinSetPixelRatio?: Array<{
    at: number
    value: number
    view?: string
    floor?: string | null
  }>
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
