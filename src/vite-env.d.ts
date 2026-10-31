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
  /** T097：滑杆、徽标矩阵、fit 共用的 demand 续帧。动画结束即停。 */
  __twinDemandFrame?: {
    askFrame: (source: 'slider' | 'badge' | 'fit') => void
    demandInvalidate: (source: 'slider' | 'badge' | 'fit') => void
    hold: (source: 'slider' | 'badge' | 'fit') => () => void
    ready: () => boolean
    status: () => {
      holds: { slider: number; badge: number; fit: number }
      spinning: boolean
      last: Array<'slider' | 'badge' | 'fit'>
    }
  }
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
  /** T090：drei Preload all 在首帧窗口之后跑完。不写 __twinReady。 */
  __twinShaderPreload?: { all: true; at: number }
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
  /** 楼层或工位时钟这一帧还在走。夜景空闲门用来和告警/人物持有分开。 */
  __twinClocksBusy?: boolean
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
  /** T043：自适应画质。demand 下只在固定连续窗口或无限 Hz 负载采样。 */
  __twinAdaptive?: {
    mode: 'idle' | 'warmup' | 'fixed-window' | 'unthrottled-load'
    sampling: boolean
    ceiling: 'perf' | 'balanced' | 'high'
    frozen: boolean
    lastSignal: 'decline' | 'incline' | 'steady' | null
    lastApplied: 'decline' | 'incline' | null
    lastFps: number | null
    pumpFrames: number
    at: number
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
  /** T063：线框挂上之后写入，关掉就删。外壳或当前层，不含全场景。 */
  __twinWire?: {
    mode: 'shell' | 'floor'
    floorId: string | null
    count: number
    names: string[]
  }
  /** T073：行道树 Detailed 档位。性能档和白模不挂，on 为 false。 */
  __twinTreeLod?: {
    on: boolean
    reason: string
    distances: number[]
    hysteresis: number
    level: number | null
    stockHidden: number
    hiFaces: number
    loFaces: number
  }
  /** DemandLoop 里的测距挂载点。工具本体在懒包里。 */
  __twinMeasureSlot?: (node: import('react').ReactNode) => void
  __twinMeasureExit?: () => void
  /** 测距工具挂上之后为 true，室内楼板才去拉拾取包围树。 */
  __twinMeasureOn?: boolean
  /** 当前还挂着的拾取包围树组数，以及建出树的几何体个数。 */
  __twinPickBvh?: { mounted: number; trees: number }
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
    /** camera-controls：false 只停拖曳。沿轨飞另外把 update 换成空函数。 */
    enabled?: boolean
  }
  /** T041：?vp= 还原期间不要让取景和距离夹紧改掉眼点。 */
  __vpH?: boolean
  /** T041：导览巡游时单层相机不要抢 setLookAt。 */
  __vpT?: boolean
  /** T041：导览在画布外泵一帧。不进 cameraRest / frameSchedule。 */
  __vpP?: () => void
  /**
   * T071：导览沿轨播放节点。格网槽把它并进画布。
   * 默认没有。观众地址不写它，也不加载 MotionPathControls。
   */
  __twinTourMotionNode?: import('react').ReactNode
  /** T071：播放自然结束时清掉书签条上的「正在播」标记。 */
  __twinMotionPathIdle?: () => void
  /** T071：沿轨飞状态。播完 owner 交回 camera-controls。 */
  __twinMotionPath?: {
    playing: boolean
    owner: 'motion-path' | 'camera-controls'
    loop: boolean
    offset: number
    points: number
    floors: string[]
    handedBack: boolean
  }
  /**
   * T060：结构边。默认不挂。
   * latch 固定为 edges-wins：结构边和 T063 Wireframe 同时开时只画 Edges。
   */
  __twinStructureEdges?: {
    mode: 'off' | 'edges' | 'wireframe'
    count: number
    threshold: number
    latch: 'edges-wins'
  }
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
    boxDeskIds: string[]
    searchDeskIds: string[]
    alarmColor: string
    boxColor: string
    searchColor: string
  }
  /** T052：进层 Shift 框选。proxies 是本层工位代理数，描边仍走多描边封顶。卸载时删掉。 */
  __twinBoxSelect?: {
    floorId: string
    proxies: number
    deskIds: string[]
  }
  /** T058：?demoEdit=1 进层后的摆点。离开楼层或卸载时删掉。 */
  __twinDemoEdit?: {
    demo: true
    floorId: string
    catalog: 'cameras-demo' | 'alarms-demo'
    mode: 'translate' | 'rotate'
    selectedId: string | null
    cameraCount: number
    alarmCount: number
    /** drei TransformControls 已经挂上当前选中的点。 */
    gizmo: boolean
  }
  /** T045：DEMO 摄像头覆盖锥。离开楼层或卸载时删掉。 */
  __twinCameraFov?: {
    demo: true
    floorId: string
    cap: number
    count: number
    ids: string[]
  }
  /** T042：DEMO 告警时间轴。离开楼层或卸载时删掉。 */
  __twinAlarmTimeline?: {
    demo: true
    live: boolean
    cursorMs: number
    startMs: number
    nowMs: number
    alarmDeskIds: string[]
    samples: {
      startMs: number
      withHistoryMs: number
      partialMs: number
      almostNowMs: number
    }
  }
  /** T046：楼层小地图上的眼点 / 注视点。离开单层后删掉。 */
  __twinMinimap?: {
    floorId: string
    eyeX: number
    eyeZ: number
    targetX: number
    targetZ: number
    headingX: number
    headingZ: number
  }
  __twinFlyEnd?: { deskId: string; x: number; y: number; z: number; started: number }
  __twinExplode?: TwinExplodeStats
  /** T091：工位拆解。与楼层 __twinExplode 分开。徽标和标签读同一份 progress。 */
  __twinStationExplode?: {
    progress: number
    animating: boolean
    active: boolean
    count: number
    gap: number
    /** 这一帧置过 instanceMatrix.needsUpdate 的网格数。每个网格一次，不是每个实例一次。 */
    needsUpdate: number
  }
  /** T095：工位分包公布的分层。圆标和标签用它算增量，不另建时钟。 */
  __twinStationFrame?: {
    axis: 'x' | 'z'
    band: number
    gap: number
    keys: number[]
    radial: boolean
    originX: number
    originZ: number
  } | null
  /**
   * 首屏那份楼层时钟。工位分包另有一份 explode.ts，不能拿它的 readExplodeMotion 当外壳进度。
   * 没挂上时，分包改读 __twinExplode.progress。
   */
  __twinReadExplodeMotion?: () => { progress: number; animating: boolean }
  /** T095：写圆标矩阵或标签 Y 时读。实现在工位分包，内部走 badgeExplodeOffset / readExplodeMotion / readStationExplodeMotion。 */
  __twinBadgeExplodeDelta?: (
    floorId: string,
    anchorX: number,
    anchorZ: number,
    inheritFloorLift: boolean,
  ) => { x: number; y: number; z: number }
  /** T096：工位炸开后的取景。导览或书签占着镜头时不会写。 */
  __twinStationExplodeFit?: {
    kind: 'open' | 'scrub' | 'close'
    progress: number
    dolly: boolean
  }
  /** T098：炸开后的实例拾取。built 只在落定后增加，动画帧里不变。 */
  __twinExplodePick?: {
    armed: number
    refreshed: number
    built: number
    animating: boolean
  }
  __twinMonitorBoxes?: TwinMonitorBoxes
  __twinFacadeBoxes?: TwinFacadeBoxes
  __twinSetExploded?: (exploded: boolean) => void
  /** T094：滑杆目标 0..1。没写过时布尔开关仍走向 1。短名是为了少占首屏。 */
  __ea?: number
  /** 为真时这一下直接落到目标。 */
  __es?: boolean
  /** 单层里用户动过进度之后，工位时钟才跟随。离开单层会关掉。 */
  __twinExplodeFollow?: boolean
  __twinSetExplodeProgress?: (value: number) => void
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
  /** T048：进层人流路径。回总览卸载时删掉。points 与传给 Line 的数组是同一引用。 */
  __twinWalkPaths?: {
    floorId: string
    visible: boolean
    occupancy: boolean
    dashed: boolean
    opacity: number
    lift: number
    order: number
    lines: number
    points: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>
    setVisible: (on: boolean) => void
    setOccupancy: (on: boolean) => void
  }
  /** T050：总览方位块。离开总览后删掉。北在 -Z。 */
  __twinGizmo?: {
    view: 'building'
    faces: readonly string[]
    north: '北'
    renderPriority: number
  }
  /** T054：告警提示音。晚加载分包挂上后才有。 */
  __twinAlarmAudio?: {
    muted: boolean
    unlocked: boolean
    played: number
    lastReason: 'enqueue' | 'focus' | null
  }
  /**
   * T082：告警语音。晚加载分包挂上后才有。
   * 默认关。speech=1，或演示模式 demo=1 / demoEdit=1，才打开。
   */
  __twinAlarmSpeech?: {
    enabled: boolean
    muted: boolean
    unlocked: boolean
    ownsChannel: boolean
    supported: boolean
    spoken: number
    cancelled: number
    lastUtterance: string | null
    voiceLang: string | null
  }
  /** T082 × T054 × T084：声道门闩。语音、提示音、桌面通知分包共用。 */
  __twinAlarmChannel?: {
    speechOwns: boolean
    /** 桌面通知开着且已经允许。文档 hidden 时由它接手。 */
    notifyCovers?: boolean
    holder: 'tone' | 'speech' | 'notify' | null
    until: number
  }
  /**
   * T084：告警桌面通知。晚加载分包挂上后才有。
   * 默认关。notify=1，或演示模式 demo=1 / demoEdit=1，才打开。notify=0 强制关。
   * 只在文档 hidden 时弹一条。权限拒绝或非安全上下文时 permission 不会是 granted。
   */
  __twinAlarmNotify?: {
    enabled: boolean
    permission: 'granted' | 'denied' | 'default' | 'unsupported'
    supported: boolean
    hidden: boolean
    shown: number
    lastBody: string | null
  }
  /** T066：作者辅助节点。格网槽在刷新时把它和测距、格网画在一起。默认没有。 */
  __twinAuthorNode?: import('react').ReactNode
  /** T072：批辅线节点。格网槽在刷新时把它和测距画在一起。默认没有。 */
  __twinSegmentsNode?: import('react').ReactNode
  /** T074：工位屏节点。格网槽在刷新时把它和测距画在一起。默认没有。 */
  __twinScreenVideoNode?: import('react').ReactNode
  /** T079：屏海报节点。格网槽在刷新时把它和工位屏画在一起。默认没有。 */
  __twinScreenImageNode?: import('react').ReactNode
  /** T103：SimReady 试吃节点。格网槽的第七个缺省位。默认没有。 */
  __twinSimReadyNode?: import('react').ReactNode
  /** T103：试吃探针。MeshoptDecoder 在晚加载分包里，不进 hardGate。 */
  __twinSimReady?: {
    on: boolean
    mounted: number
    failed: number
    decoder: 'MeshoptDecoder'
    credit: 'NVIDIA'
    files: readonly string[]
  }
  /**
   * T079：工位显示器和摄像头预览的静态海报。默认开。
   * 图层 screenImage 缺省为开；?screenImage=0 关掉；?screenImage=1 或 ?demoEdit=1 打开。
   * 贴图只走 public/textures/screens 的 jpg/webp。视频关着时海报仍在。
   * rounded 为假：drei Image 用普通 plane，半径保持 0。
   */
  __twinScreenImage?: {
    demo: true
    on: boolean
    mounted: boolean
    desks: number
    camera: boolean
    cap: number
    deskSrc: string
    cameraSrc: string
    impl: 'drei-Image'
    rounded: false
  }
  /**
   * T074：工位显示器和摄像头预览。默认关。
   * 图层 screenVideo、?screenVideo=1 或 ?demoEdit=1 打开后才挂 drei useVideoTexture。
   * hls 为假：只播本地 mp4，不接 HLS / CDN。
   */
  __twinScreenVideo?: {
    demo: true
    on: boolean
    mounted: boolean
    src: string
    muted: true
    playsInline: true
    loop: true
    desks: number
    camera: boolean
    hls: false
    impl: 'drei-useVideoTexture'
  }
  /**
   * T072：DEMO 分区辅线。默认关。打开后才挂 drei Segments。
   * shown 不超过 limit；dropped 是超出上限、没有画出来的条数。
   */
  __twinSegments?: {
    on: boolean
    mounted: boolean
    shown: number
    limit: number
    dropped: number
    source: 'off' | 'overview' | 'floor'
    floorId: string | null
  }
  /** T059 格网挂上槽之后才有。返回 false 表示 Canvas 里的槽还没接上。 */
  __twinSceneOverlayFlush?: () => boolean
  /**
   * T066：灯光/相机辅助。默认关。
   * `?demoEdit=1` 或 `layers.debugHelpers === true` 才挂 drei useHelper。
   */
  __twinAuthorHelpers?: {
    on: boolean
    mounted: boolean
    kinds: string[]
    setDebugHelpers?: (on: boolean) => void
  }
  /** T065：墙面贴花。默认关。打开后才挂 drei Decal。 */
  __twinDecals?: {
    on: boolean
    mounted: number
    decals: number
    images: number
    cap: number
    blocked: boolean
  }
  /**
   * T070：对焦装入。默认不挂 Center / Bounds。
   * center / bounds 为真才表示对应组件正在画布里。
   * handedBack 为假只发生在讲解对焦的 fit 动画期间。
   */
  __twinFocusFit?: {
    resident: boolean
    center: boolean
    bounds: boolean
    centerLoaded: boolean
    boundsLoaded: boolean
    mode: 'off' | 'center' | 'bounds'
    subject: 'selection' | 'layer' | null
    handedBack: boolean
    blocked: '' | 'tour' | 'blueprint' | 'empty' | 'missing'
  }
  /** T059：米制格网。默认关。打开后才挂 drei Grid 和 axesHelper。 */
  __twinGrid?: {
    on: boolean
    mounted: boolean
    cellM: number
    sectionM: number
    axisM: number
    y: number | null
    fadeM: number | null
  }
  /**
   * T069：讲解相机轨预览。默认关。
   * 图层 tourPath 或 ?demoEdit=1 打开后才挂 drei CatmullRomLine。关了 mounted 为 false。
   */
  __twinTourPath?: {
    demo: true
    on: boolean
    mounted: boolean
    points: number
    segments: number
    tension: number
    curve: 'centripetal'
  }
  /**
   * T068：?demoEdit=1 的矩形面光。默认关。
   * 打开后 count 不超过 cap，init 表示已经调用过 RectAreaLightUniformsLib.init()。
   */
  __twinRectArea?: {
    author: boolean
    on: boolean
    init: boolean
    cap: number
    count: number
    ids: string[]
    helper: 'RectAreaLightHelper'
  }
  /**
   * T077：?demoEdit=1 的路灯 GLTF 片段浅拷。默认关。
   * deep 固定 false，几何和材质与已经实例化的路灯共用。
   * 改材质会连带那些实例一起变。count 不超过 cap。不替代 Instanced / Batched 主路径。
   */
  __twinClone?: {
    on: boolean
    mounted: boolean
    count: number
    cap: number
    dropped: number
    deep: false
    castShadow: true
    receiveShadow: true
    sharedMaterials: true
    source: 'off' | 'street_lamp'
    setOn?: (on: boolean) => void
  }
  /**
   * T080：?demoEdit=1 或作者态的设备/家具落点拖摆。默认关。
   * dragging 为真时 CameraControls 轨道和 T052 框选让路。松手交还。
   * 观众默认 on 为 false，不加载 DragControls。
   */
  __twinDrag?: {
    on: boolean
    mounted: boolean
    dragging: boolean
    owner: 'drag' | 'camera-controls'
    axisLock: 'y'
    devices: number
    furniture: number
    count: number
    latched: boolean
    moved: number
    places: { id: string; kind: 'device' | 'furniture'; x: number; y: number; z: number }[]
    setOn?: (on: boolean) => void
  }
  /**
   * T076：视锥进出暂停远处路灯和告警闪烁。
   * 均衡和高画质默认关。性能档默认开。`?frustum=1` / `?frustum=0` 盖过画质。
   * 关着的时候不加载 drei useIntersect。alarm/flash/sign 为 null 表示宿主不在场景里。
   */
  __twinFrustumBlink?: import('./frustum/blinkGate').FrustumBlinkState
  /**
   * T081：同源多标签薄总线。晚加载分包挂上后才有。
   * 只接力 focus / 视角令牌 / alarmId / 图层。不是 T049 的分享链接。
   * `?bus=0` 或 setOn(false) 关掉，并 close() BroadcastChannel。
   */
  __twinBus?: {
    on: boolean
    channel: 'uniview-twin'
    tab: string
    sent: number
    applied: number
    dropped: number
    closed: boolean
    setOn?: (on: boolean) => void
  }
  /**
   * T085：Screen Wake Lock 大屏常亮。晚加载分包挂上后才有。
   * 默认关。`wakeLock=1`，或演示模式 `demo=1` / `demoEdit=1`，才打开。
   * `wakeLock=0` 强制关。文档不可见时不申请。失败降级，不抛进主路径。
   */
  __twinWakeLock?: {
    enabled: boolean
    held: boolean
    phase: 'off' | 'held' | 'armed' | 'degraded'
    supported: boolean
    visible: boolean
    forceOff: boolean
    setOn?: (on: boolean) => void
  }
  /**
   * T086：密叠拾取轮询。默认关。
   * DEMO（demoEdit / debugHelpers）或模型层（presentation=model）才挂 drei CycleRaycast。
   * keyCode 固定 9（Tab）。scroll 固定 false，滚轮留给 CameraControls。
   * 观众首屏不请求 CycleRaycast.js。
   */
  __twinCycle?: {
    on: boolean
    mounted: boolean
    armed: boolean
    keyCode: 9
    scroll: false
    hits: number
    cycle: number
    deskId: string | null
    deviceId: string | null
    instanceId: number | null
    layer: 'demo' | 'dense' | null
    blocked: string
    hold: boolean
    setOn?: (on: boolean) => void
  }
  /**
   * T087：文档画中画值守。晚加载分包挂上后才有。
   * 默认可以点开。`?docpip=0` 关掉。没有 documentPictureInPicture 时按钮停用，不抛错。
   * 小窗只有告警 DOM。不是 T083 的视频值守，也不把画面搬进小窗。
   * 不是 T081 的多标签：这里不往总线上发焦点、视角或图层。
   */
  __twinDocumentWatch?: {
    phase: 'idle' | 'open'
    supported: boolean
    disabled: boolean
    alarms: number
  }
  __twinDocumentWatchStore?: {
    getState: () => {
      alarms?: readonly { id?: string; floorId?: string; deviceId?: string; message?: string }[]
      floors?: readonly { id?: string; name?: string }[]
      focusedDeviceId?: string | null
      focusDevice?: (target: { floor: string; deskId: string | null; deviceId?: string | null }) => void
    }
    subscribe: (listener: () => void) => () => void
  }
  /** 文档画中画。Chrome 系才有。没有时文档值守停用。 */
  documentPictureInPicture?: {
    requestWindow?: (options?: {
      width?: number
      height?: number
      disallowReturnToOpener?: boolean
    }) => Promise<Window>
  }
}
