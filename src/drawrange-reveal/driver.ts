import {
  collectRevealMeshes,
  DRAW_RANGE_REVEAL_MS,
  DRAW_RANGE_REVEAL_ROOT,
  revealSkip,
  revealTick,
  type RangeGeometry,
  type RangeMesh,
  type RevealEnd,
  type RevealSkip,
} from './plan'
import { createDrawRangeReveal } from './reveal'

/** R3F 每帧交给订阅者的那份 state，这里只用几项。 */
export interface RevealFrameState {
  invalidate: () => unknown
  frameloop?: string
  internal?: { frames?: number }
}

export interface RevealStats {
  mounted: true
  impl: 'setDrawRange'
  ms: number
  active: boolean
  progress: number
  floorId: string | null
  meshes: string[]
  runs: number
  completed: number
  last: RevealEnd | RevealSkip | null
}

export interface RevealEnv {
  now: () => number
  view: () => string | undefined
  scene: () => RangeMesh | null | undefined
  overlay: () => boolean
  night: () => boolean
  reducedMotion: () => boolean
  hidden: () => boolean
  stationBusy: () => boolean
  floorId: () => string | null
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (id: unknown) => void
  /** 看门狗收尾后补一帧。走店里那条带门的 invalidate。 */
  kick: () => void
  publish: (stats: RevealStats) => void
}

/** 帧回调没来时的兜底。超过显形时长这么久还没收尾，就直接放回原值。 */
const WATCHDOG_SLACK_MS = 400

function attachedTo(mesh: RangeMesh, root: RangeMesh): boolean {
  for (let node: RangeMesh | null | undefined = mesh; node; node = node.parent) {
    if (node === root) return true
  }
  return false
}

export function createRevealDriver(env: RevealEnv) {
  let frameState: RevealFrameState | null = null
  let handled = new Set<RangeGeometry>()
  let watched: RangeMesh[] = []
  let primed = false
  let startedAt = 0
  let timer: unknown = null
  const stats: RevealStats = {
    mounted: true,
    impl: 'setDrawRange',
    ms: DRAW_RANGE_REVEAL_MS,
    active: false,
    progress: 0,
    floorId: null,
    meshes: [],
    runs: 0,
    completed: 0,
    last: null,
  }

  // R3F 在帧内 invalidate 会把 frames 置 2，帧末再减一。绘制时还不到 2，就是下一帧被空闲门或闸门压住了。
  const reveal = createDrawRangeReveal({
    nextFrame: () => frameState?.frameloop === 'always' || (frameState?.internal?.frames ?? 0) >= 2,
    onStall: () => finish('no-frame'),
  })

  function finish(reason: RevealEnd) {
    if (timer != null) {
      env.clearTimer(timer)
      timer = null
    }
    if (!reveal.active()) return
    reveal.end()
    stats.active = false
    stats.progress = 1
    stats.last = reason
    if (reason === 'done') stats.completed += 1
    env.publish(stats)
  }

  /** 上次那两块还挂在场景里、几何也没换，就不必再遍历。 */
  function settled(scene: RangeMesh): boolean {
    if (watched.length === 0) return false
    return watched.every((mesh) => mesh.geometry != null && handled.has(mesh.geometry) && attachedTo(mesh, scene))
  }

  function step(state: RevealFrameState, scene: RangeMesh) {
    const tick = revealTick({
      now: env.now(),
      startedAt,
      view: env.view(),
      attached: reveal.meshes().every((mesh) => attachedTo(mesh, scene)),
      hidden: env.hidden(),
    })
    if ('end' in tick) {
      finish(tick.end)
      return
    }
    state.invalidate()
    reveal.frame(tick.progress)
    stats.progress = tick.progress
  }

  function onFrame(state: RevealFrameState) {
    frameState = state
    const view = env.view()
    if (view !== 'floor') {
      primed = true
      finish('view')
      if (handled.size > 0 || watched.length > 0) {
        handled = new Set()
        watched = []
      }
      return
    }
    const scene = env.scene()
    if (!scene) return
    if (reveal.active()) {
      step(state, scene)
      return
    }
    if (settled(scene)) return
    const meshes = collectRevealMeshes(scene.getObjectByName?.(DRAW_RANGE_REVEAL_ROOT))
    watched = meshes
    const fresh = meshes.filter((mesh) => mesh.geometry != null && !handled.has(mesh.geometry))
    if (!primed) {
      primed = true
      for (const mesh of fresh) handled.add(mesh.geometry as RangeGeometry)
      if (fresh.length > 0) {
        stats.last = 'late'
        env.publish(stats)
      }
      return
    }
    if (fresh.length === 0) return
    for (const mesh of fresh) handled.add(mesh.geometry as RangeGeometry)
    const skip = revealSkip({
      view,
      overlay: env.overlay(),
      night: env.night(),
      reducedMotion: env.reducedMotion(),
      hidden: env.hidden(),
      stationBusy: env.stationBusy(),
    })
    if (skip) {
      stats.last = skip
      env.publish(stats)
      return
    }
    if (reveal.begin(fresh) === 0) return
    startedAt = env.now()
    stats.active = true
    stats.progress = 0
    stats.runs += 1
    stats.last = null
    stats.floorId = env.floorId()
    stats.meshes = reveal.meshes().map((mesh) => mesh.name)
    timer = env.setTimer(() => {
      timer = null
      if (!reveal.active()) return
      finish('watchdog')
      env.kick()
    }, DRAW_RANGE_REVEAL_MS + WATCHDOG_SLACK_MS)
    env.publish(stats)
    step(state, scene)
  }

  return {
    onFrame,
    finish,
    stats: () => stats,
    reveal,
  }
}
