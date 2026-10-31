/**
 * T097：滑杆（T094）、徽标写矩阵（T095）、fit（T096）共用的 demand 续帧。
 *
 * 与 ExplodedLayout.askFrame 相同：当前 useFrame 里同步 invalidate 不一定排到下一帧，
 * 所以先 rAF，下一帧再走 invalidate。多路在同一帧合并成一次。
 * 没人再要帧、持有也松开之后，补一帧落下姿态然后停。这里不改 frameloop，也不自转。
 *
 * FixedFramePump（AdaptiveQuality）不走这个入口。它只在采样窗里于 useFrame
 * 同步 invalidate，卸下组件就停。不要把采样泵接到这里。
 */

export type DemandFrameSource = 'slider' | 'badge' | 'fit'

type Kick = () => void

const holds: Record<DemandFrameSource, number> = { slider: 0, badge: 0, fit: 0 }
const queued = new Set<DemandFrameSource>()
let last: DemandFrameSource[] = []
let bound: Kick | null = null
let wake = 0
let tail = false
let misses = 0
let generation = 0
/** fire 正在把这一拍交给 invalidate。停稳闸门必须放行，否则续帧自己被掐掉。 */
let delivering = false
/** 工位时钟真正走过一拍之后才拦自续。进层准备还没点过工位时不拦。 */
let stationMoved = false

/** 入口还没绑上时最多补这么多次，避免空转。 */
const MISS_LIMIT = 8

function held(): boolean {
  return holds.slider > 0 || holds.badge > 0 || holds.fit > 0
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function remember(): void {
  const next = new Set<DemandFrameSource>(queued)
  if (holds.slider > 0) next.add('slider')
  if (holds.badge > 0) next.add('badge')
  if (holds.fit > 0) next.add('fit')
  last = [...next]
}

function arm(): void {
  if (wake !== 0) return
  const request = globalThis.requestAnimationFrame
  const token = generation
  if (typeof request !== 'function') {
    wake = -1
    queueMicrotask(() => {
      if (generation !== token || wake !== -1) return
      wake = 0
      fire()
    })
    return
  }
  wake = request(() => {
    if (generation !== token) return
    wake = 0
    fire()
  })
}

function fire(): void {
  if (pageHidden()) return
  const run = bound
  if (!run) {
    misses += 1
    if (misses <= MISS_LIMIT && (held() || tail || queued.size > 0)) arm()
    return
  }
  misses = 0
  const tailBefore = tail
  remember()
  queued.clear()
  delivering = true
  try {
    run()
  } finally {
    delivering = false
  }
  if (held()) {
    arm()
    return
  }
  if (tail && !tailBefore) {
    arm()
    return
  }
  tail = false
}

export function bindDemandFrame(next: Kick | null): void {
  bound = next
  if (next && (held() || tail || queued.size > 0)) arm()
}

export function demandFrameReady(): boolean {
  return bound != null
}

export function demandFrameDelivering(): boolean {
  return delivering
}

export function markStationDemandMotion(): void {
  stationMoved = true
}

function floorGesture(): boolean {
  const current = window.event
  const type = current && typeof current === 'object' && 'type' in current ? String((current as Event).type) : ''
  return type === 'keydown' || type === 'pointerdown' || type === 'click' || type === 'input' || type === 'wheel'
}

/**
 * 单层工位已经停、demand 也没在续帧时，人物/告警的 Hz 仍会自己 invalidate。
 * 性能档人物是 10Hz，1024 昼景画布跟得上，800ms 采样会超过 3 帧。
 * 这期间丢掉这类自续；点击、工位还在动、镜头还没 rest、以及正在投递的那一拍要放行。
 */
export function blockSettledFloorInvalidate(): boolean {
  if (!stationMoved) return false
  if (delivering) return false
  if (typeof window === 'undefined') return false
  if (window.__twinView !== 'floor') return false
  if (floorGesture()) return false
  if (window.__twinStationExplode?.animating === true) return false
  if (held() || tail || queued.size > 0 || wake !== 0) return false
  const motion = window.__twinSchedule?.holds?.motion ?? 0
  if (motion > 0 && window.__twinCameraRested !== true) return false
  return true
}

/** 包住 store.invalidate。重复包装直接返回原函数。 */
export function guardDemandInvalidate(invalidate: (frames?: number) => void): ((frames?: number) => void) & {
  __t097Settle?: boolean
} {
  const current = invalidate as ((frames?: number) => void) & { __t097Settle?: boolean }
  if (current.__t097Settle) return current
  const wrapped = ((frames?: number) => {
    if (blockSettledFloorInvalidate()) return
    current(frames)
  }) as ((frames?: number) => void) & { __t097Settle?: boolean }
  wrapped.__t097Settle = true
  return wrapped
}

/** 要一帧。同一帧多次调用只排一次 rAF，不在当前调用栈上 invalidate。 */
export function askFrame(source: DemandFrameSource): void {
  queued.add(source)
  arm()
}

/** 与 askFrame 同一入口。给滑杆、徽标矩阵、fit 用，不要在 useFrame 里直接 invalidate。 */
export function demandInvalidate(source: DemandFrameSource): void {
  askFrame(source)
}

/**
 * 动画进行中持有。返回的 release 可重复调用。
 * 最后一路松开后再补一帧，然后停。
 */
export function holdDemandFrame(source: DemandFrameSource): () => void {
  holds[source] += 1
  queued.add(source)
  arm()
  let released = false
  return () => {
    if (released) return
    released = true
    holds[source] = Math.max(0, holds[source] - 1)
    if (!held()) {
      tail = true
      arm()
    }
  }
}

/** 标签页回到前台时，若动画还没结束，把已经排过的那一帧接上。 */
export function resumeDemandFrame(): void {
  if (pageHidden()) return
  if (held() || tail || queued.size > 0) arm()
}

export function demandFrameSnapshot(): {
  holds: Record<DemandFrameSource, number>
  spinning: boolean
  last: DemandFrameSource[]
} {
  return {
    holds: { slider: holds.slider, badge: holds.badge, fit: holds.fit },
    spinning: wake !== 0 || tail || held() || queued.size > 0,
    last: last.slice(),
  }
}

/** 测试重置。运行时不要调用。 */
export function resetDemandFrame(): void {
  generation += 1
  if (wake > 0 && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(wake)
  wake = 0
  tail = false
  misses = 0
  bound = null
  queued.clear()
  last = []
  holds.slider = 0
  holds.badge = 0
  holds.fit = 0
  delivering = false
  stationMoved = false
}
