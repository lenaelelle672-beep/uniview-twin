import { isFloorId } from '../data/floors'

/** 装入时四周留白，单位米。不改镜头缓动时长。 */
export const FIT_PADDING_M = 1.5

/** Bounds 动画时长。到点就把镜头交还，不让它继续占着 useFrame。 */
export const BOUNDS_FIT_SEC = 0.9

/** demand 下过渡若一直不结束，泵帧到这里就停，并再 invalidate 一次。 */
export const FIT_PUMP_MS = 4000

export const FOCUS_NEVER_NAMES = ['Tower', 'Buildings', 'Site', 'AboveGradeContext'] as const

export type FocusBlock = '' | 'tour' | 'blueprint'

export type FocusSubject = 'selection' | 'layer'

export interface FocusQuery {
  view: string
  floorId: string | null
  focusedDeskId: string | null
  boxFloorId: string | null
  boxDeskIds: readonly string[]
}

export type FocusPlan =
  | { kind: 'selection'; floorId: string; deskIds: string[] }
  | { kind: 'layer'; floorId: string; names: readonly string[] }

export interface Vec3Like {
  x: number
  y: number
  z: number
}

export interface OrbitPose {
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
}

export interface FrameRig {
  fitToBox?: (
    box: object,
    enableTransition?: boolean,
    padding?: {
      paddingLeft?: number
      paddingRight?: number
      paddingTop?: number
      paddingBottom?: number
    },
  ) => Promise<unknown>
  rotateTo?: (azimuth: number, polar: number, enableTransition?: boolean) => Promise<unknown>
  polarAngle?: number
  azimuthAngle?: number
}

type KeyEvent = {
  key: string
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  isComposing?: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}

/**
 * 导览巡游（tourPose）和小地图飞入不从这里触发。
 * 巡游进行时本功能让路，避免和 setLookAt 抢同一只 CameraControls。
 */
export function focusFitBlock(view: string, touring: boolean): FocusBlock {
  if (touring) return 'tour'
  if (view === 'blueprint') return 'blueprint'
  return ''
}

export function deskFloorId(deskId: string): string | null {
  const splitAt = deskId.lastIndexOf('-')
  if (splitAt <= 0) return null
  const floorId = deskId.slice(0, splitAt)
  return isFloorId(floorId) ? floorId : null
}

/** 当前层的候选名。先室内，再楼板，再外壳。绝不把整塔算进去。 */
export function layerCandidateNames(floorId: string): readonly string[] {
  const shell = floorId === 'B1' ? 'B1' : `FloorShell-${floorId}`
  return ['FloorInterior', 'FloorPlate', shell]
}

function sameFloorDesks(floorId: string, deskIds: readonly string[]): string[] {
  return deskIds.filter((id) => deskFloorId(id) === floorId)
}

/**
 * 选中工位优先于整层。没有当前层、也没有落在这一层的选中物时返回 null，
 * 调用方不得改去包整塔。
 */
export function planFocusTarget(query: FocusQuery): FocusPlan | null {
  if (query.view === 'blueprint') return null
  const floorId = query.floorId
  if (!floorId || !isFloorId(floorId)) return null

  if (query.boxFloorId === floorId) {
    const deskIds = sameFloorDesks(floorId, query.boxDeskIds)
    if (deskIds.length > 0) return { kind: 'selection', floorId, deskIds }
  }

  if (query.focusedDeskId && deskFloorId(query.focusedDeskId) === floorId) {
    return { kind: 'selection', floorId, deskIds: [query.focusedDeskId] }
  }

  if (query.view !== 'floor') return null
  return { kind: 'layer', floorId, names: layerCandidateNames(floorId) }
}

export function acceptsFocusKey(event: KeyEvent, kind: 'center' | 'narration'): boolean {
  if (event.isComposing || event.repeat || event.altKey || event.metaKey || event.ctrlKey) return false
  if (event.key !== 'c' && event.key !== 'C') return false
  const shift = event.shiftKey === true
  if (kind === 'narration' ? !shift : shift) return false
  const tag = event.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false
  if (event.target?.isContentEditable) return false
  return true
}

/**
 * camera-controls 只有在 out.isVector3 时才写回传入对象，否则返回新向量。
 * 这里只读返回值，避免把普通对象当成 Vector3 之后记成原点。
 */
export function readOrbitPose(rig: {
  getPosition(out: Vec3Like, receiveEndValue?: boolean): Vec3Like
  getTarget(out: Vec3Like, receiveEndValue?: boolean): Vec3Like
}): OrbitPose {
  const position = rig.getPosition({ x: 0, y: 0, z: 0 }, false)
  const target = rig.getTarget({ x: 0, y: 0, z: 0 }, false)
  return {
    px: position.x,
    py: position.y,
    pz: position.z,
    tx: target.x,
    ty: target.y,
    tz: target.z,
  }
}

/**
 * 用现有 CameraControls.fitToBox 把盒子装进视野。
 * fitToBox 会把极角吸到直角，这里紧接着 rotateTo 回原来的方位，避免改用户的观察方向。
 * 不替换 makeDefault，也不改镜头缓动时长。
 */
export function frameWithControls(rig: FrameRig, box: object, padding: number): Promise<unknown> | null {
  if (!rig.fitToBox) return null
  const polar = rig.polarAngle
  const azimuth = rig.azimuthAngle
  const fit = rig.fitToBox(box, true, {
    paddingLeft: padding,
    paddingRight: padding,
    paddingTop: padding,
    paddingBottom: padding,
  })
  if (rig.rotateTo && typeof azimuth === 'number' && typeof polar === 'number') {
    void rig.rotateTo(azimuth, polar, true)
  }
  return fit
}

function sharedFitHold(): ((source: 'fit') => () => void) | null {
  if (typeof window === 'undefined') return null
  const api = window.__twinDemandFrame
  if (typeof api?.ready !== 'function' || !api.ready()) return null
  if (typeof api.hold !== 'function') return null
  return api.hold
}

/**
 * 过渡过程中泵 invalidate；promise 结束（或到点）后再 invalidate 一次。
 * T097：共用入口就绪时，fit 走 hold('fit')，和滑杆、徽标矩阵合并成一次 rAF。
 * 入口还没就绪就沿用本地 rAF。结束或到点后停。FixedFramePump 不经过这里。
 */
export function pumpUntilSettled(done: Promise<unknown>, invalidate: () => void, now: () => number = () => performance.now()): () => void {
  const hold = sharedFitHold()
  if (hold) {
    let stopped = false
    let timer = 0
    const release = hold('fit')
    const stop = () => {
      if (stopped) return
      stopped = true
      if (timer) clearTimeout(timer)
      timer = 0
      release()
      invalidate()
    }
    timer = window.setTimeout(stop, FIT_PUMP_MS)
    void done.then(stop, stop)
    return stop
  }
  let stopped = false
  let raf = 0
  const started = now()
  const stop = () => {
    if (stopped) return
    stopped = true
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
    raf = 0
  }
  const finish = () => {
    stop()
    invalidate()
  }
  const request = globalThis.requestAnimationFrame
  if (typeof request !== 'function') {
    invalidate()
    void done.then(finish, finish)
    return stop
  }
  const tick = () => {
    if (stopped) return
    if (now() - started >= FIT_PUMP_MS) {
      finish()
      return
    }
    invalidate()
    raf = request(tick)
  }
  raf = request(tick)
  void done.then(finish, finish)
  return stop
}

/** 暂停 CameraRig 每帧夹紧。返回的函数可重复调用。 */
export function holdViewpointFlag(): () => void {
  if (typeof window === 'undefined') return () => {}
  const previous = window.__vpH
  window.__vpH = true
  let released = false
  return () => {
    if (released) return
    released = true
    window.__vpH = previous
  }
}
