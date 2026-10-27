import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { bindTwinInvalidate, flushTwinInvalidate } from '../../scene/demandInvalidate'
import { canvasOffscreen } from '../../scene/offscreenPause'
import { stepExplodeMotion } from '../../scene/explode'
import { isCameraRested } from '../../scene/stage/cameraRest'
import { cutElevation } from '../../scene/stage/cut'
import {
  commitShadowBake,
  ensureLabelWatch,
  labelWindowClosed,
  markShadowEntry,
  noteShadowBakeFrame,
  requestShadowBake,
  shadowBakePending,
  shadowSceneReady,
  shouldDeferShadowBake,
  stepShadowBake,
  subscribeLabelWindowOpen,
} from '../../scene/stage/shadowBake'
import {
  bumpTwinFrames,
  emptyChannelClock,
  holdSnapshot,
  markDueChannels,
  retainFrameChannel,
  scheduledHz,
  soonestWakeMs,
} from '../../scene/frameSchedule'
import { FocusFloatHost } from '../../scene/focusFloat/FocusFloatHost'
import { demoEditActive, retainDemoEditParam } from '../../demo-edit/flag'
import { plaquesWanted } from '../../demo-edit/plaqueGate'
import { PICK_BVH_AFTER_FIRST_MS } from '../../scene/pick/pickBvhTiming'
import { wireframeOverlayOn } from '../../scene/wire/latch'
import { useTwinStore } from '../../store/store'
import { useOffscreenPause } from './useOffscreenPause'

function markInv(src: string) {
  if (!import.meta.env.DEV) return
  const counts = (window.__twinInvalidateCounts ??= {})
  counts[src] = (counts[src] ?? 0) + 1
  const log = (window.__twinInvalidateLog ??= [])
  log.push({ t: performance.now(), src })
  if (log.length > 400) log.splice(0, log.length - 400)
}

/** 标签页隐藏，或画布容器已经滚出视口。两件事都停需求泵。 */
function pumpPaused(): boolean {
  return document.visibilityState === 'hidden' || canvasOffscreen()
}

/**
 * D180 续帧：总览 0/2、单层性能 ≤10 / 均衡 ≤30（告警并入）、运动性能 30、后台 0。
 * 晚于场景 useFrame 读 hold，并把 invalidate 按当前 Hz 限幅（相机飞行/拖动走同一套）。
 */

export function DemandLoop() {
  const rawInvalidate = useThree((state) => state.invalidate)
  const gl = useThree((state) => state.gl)
  const quality = useTwinStore((state) => state.quality)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const view = useTwinStore((state) => state.view)
  const dayNight = useTwinStore((state) => state.dayNight)
  const presentation = useTwinStore((state) => state.presentation)
  const controls = useThree((state) => state.controls)
  const last = useRef(emptyChannelClock())
  const wake = useRef(0)
  const lastGate = useRef(0)
  const explodeHold = useRef<(() => void) | null>(null)
  const rawRef = useRef(rawInvalidate)
  const holdRef = useRef<() => void>(() => {})
  const releaseRef = useRef<() => void>(() => {})
  rawRef.current = rawInvalidate

  const gatedInvalidate = useRef(() => {
    if (pumpPaused()) return
    const { quality: q, view: v } = useTwinStore.getState()
    const hz = scheduledHz(q, v, false)
    if (Number.isFinite(hz) && hz > 0) {
      const now = performance.now()
      if (now - lastGate.current < 1000 / hz - 1) return
      lastGate.current = now
    }
    if (import.meta.env.DEV) markInv('demand-store')
    rawRef.current()
  }).current

  useLayoutEffect(() => {
    bindTwinInvalidate(() => rawRef.current())
    if (window.__twinFrames == null) window.__twinFrames = 0
    gl.shadowMap.autoUpdate = false
    if (quality === 'perf') {
      requestShadowBake('quality-off', false)
      return
    }
    const live = useTwinStore.getState()
    const defer = shouldDeferShadowBake({
      reason: 'quality',
      view: live.view,
      rested: isCameraRested(),
      labelWindowClosed: live.view !== 'floor' || labelWindowClosed(),
    })
    if (requestShadowBake('quality', defer) === 'bake-now') {
      commitShadowBake(gl, 'quality', { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [gl, quality])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    const live = useTwinStore.getState()
    const defer = shouldDeferShadowBake({
      reason: 'explode',
      view: live.view,
      rested: isCameraRested(),
      labelWindowClosed: live.view !== 'floor' || labelWindowClosed(),
    })
    if (requestShadowBake(exploded ? 'explode' : 'collapse', defer) === 'bake-now') {
      commitShadowBake(gl, exploded ? 'explode' : 'collapse', { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [exploded, gl, quality])

  useLayoutEffect(() => {
    if (quality === 'perf') return
    const live = useTwinStore.getState()
    const defer = shouldDeferShadowBake({
      reason: 'day-night',
      view: live.view,
      rested: isCameraRested(),
      labelWindowClosed: live.view !== 'floor' || labelWindowClosed(),
    })
    const bakeReason = `surface:${presentation}:${dayNight}`
    if (requestShadowBake(bakeReason, defer) === 'bake-now') {
      commitShadowBake(gl, bakeReason, { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [dayNight, gl, presentation, quality])

  // 放在最后：同一提交里昼夜/爆炸若先打了 needsUpdate，进层要清掉，飞入帧不烘。
  // 不依赖 quality，避免换档时把已经该烘的影子清掉。
  // 性能档也要记下进层时刻，否则上一层的出齐时间会把吊顶提前挂回来。
  useLayoutEffect(() => {
    if (view === 'floor') {
      markShadowEntry()
      if (useTwinStore.getState().quality === 'perf') return
      requestShadowBake(`floor:${selectedFloor ?? ''}`, true)
      gl.shadowMap.needsUpdate = false
      gl.shadowMap.autoUpdate = false
      return
    }
    if (useTwinStore.getState().quality === 'perf') return
    if (requestShadowBake(`view:${view}`, false) === 'bake-now') {
      commitShadowBake(gl, `view:${view}`, { rested: isCameraRested(), interior: false, deferred: false })
    }
  }, [gl, selectedFloor, view])

  useEffect(() => subscribeLabelWindowOpen(() => rawRef.current()), [])

  useEffect(() => {
    const rig = controls as { addEventListener?: (type: string, fn: () => void) => void; removeEventListener?: (type: string, fn: () => void) => void } | null
    if (!rig?.addEventListener || !rig.removeEventListener) return undefined
    const add = rig.addEventListener.bind(rig)
    const remove = rig.removeEventListener.bind(rig)
    let release: (() => void) | null = null
    const hold = () => {
      if (!release) release = retainFrameChannel('motion')
    }
    const drop = () => {
      release?.()
      release = null
    }
    add('wake', hold)
    add('sleep', drop)
    return () => {
      remove('wake', hold)
      remove('sleep', drop)
      drop()
    }
  }, [controls])

  useEffect(() => {
    const unsubAfter = addAfterEffect(() => {
      bumpTwinFrames()
      flushTwinInvalidate()
    })
    const unsubStore = useTwinStore.subscribe(() => {
      if (pumpPaused()) return
      gatedInvalidate()
    })
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        holdRef.current()
        return
      }
      releaseRef.current()
    }
    document.addEventListener('visibilitychange', onVis)
    gatedInvalidate()
    return () => {
      unsubAfter()
      unsubStore()
      document.removeEventListener('visibilitychange', onVis)
      if (wake.current) window.clearTimeout(wake.current)
    }
  }, [gatedInvalidate])

  // T067：滚出视口和标签隐藏分开。先清掉已经排上的 hz 定时器，避免离屏后还补一帧。
  // 回到视口沿用 soonestWakeMs，不另起一套闸门，也不和正在走的 wake 再排一个。
  const holdDemandWake = () => {
    if (!wake.current) return
    window.clearTimeout(wake.current)
    wake.current = 0
  }
  const releaseDemandWake = () => {
    if (wake.current) return
    if (pumpPaused()) return
    const { quality: q, view: v } = useTwinStore.getState()
    const hz = scheduledHz(q, v, false)
    const now = performance.now()
    const delay = soonestWakeMs(last.current, q, now, false, v)
    if (hz === Number.POSITIVE_INFINITY || delay === 0) {
      markDueChannels(last.current, q, now, v)
      rawRef.current()
      return
    }
    if (!Number.isFinite(delay) || hz <= 0) {
      gatedInvalidate()
      return
    }
    wake.current = window.setTimeout(() => {
      wake.current = 0
      if (pumpPaused()) return
      markDueChannels(last.current, q, performance.now(), v)
      rawRef.current()
    }, delay)
  }
  holdRef.current = holdDemandWake
  releaseRef.current = releaseDemandWake
  useOffscreenPause(gl.domElement, holdDemandWake, releaseDemandWake)

  useFrame(({ clock, scene }) => {
    const { exploded: boom, view: liveView, quality: liveQuality, selectedFloor: liveFloor } = useTwinStore.getState()
    if (liveView === 'floor') ensureLabelWatch(scene)
    if (liveQuality !== 'perf' && !pumpPaused() && shadowBakePending()) {
      const cutActive = cutElevation(liveView, liveFloor) != null
      const interiorMounted = liveView !== 'floor' || scene.getObjectByName('FloorInterior') != null
      const windowClosed = liveView !== 'floor' || labelWindowClosed()
      const ready = shadowSceneReady({
        view: liveView,
        rested: isCameraRested(),
        interiorMounted,
        cutActive,
        clippingEnabled: gl.localClippingEnabled,
        labelWindowClosed: windowClosed,
      })
      noteShadowBakeFrame({
        ready,
        rested: isCameraRested(),
        interior: interiorMounted,
        cutActive,
        clipping: gl.localClippingEnabled,
        windowClosed,
      })
      const baked = stepShadowBake(ready)
      if (baked) {
        commitShadowBake(gl, baked, { rested: isCameraRested(), interior: interiorMounted, deferred: true })
      } else if (ready) {
        // 单层没有人物/告警时调度是 0Hz。窗关上的 hold 帧再要一帧，阴影 pass 才落在窗后。
        rawRef.current()
      }
    }
    const { animating } = stepExplodeMotion(boom, liveView, clock.elapsedTime)
    if (animating) {
      if (!explodeHold.current) explodeHold.current = retainFrameChannel('motion')
    } else if (explodeHold.current) {
      explodeHold.current()
      explodeHold.current = null
    }
    const hidden = pumpPaused()
    const hz = scheduledHz(liveQuality, liveView, hidden)
    window.__twinFrameCount = window.__twinFrames ?? 0
    window.__twinLastFrameAt = performance.now()
    window.__twinGlFrame = gl.info.render.frame
    window.__twinSchedule = { hz, view: liveView, quality: liveQuality, hidden, holds: holdSnapshot() }
    if (hidden) return
    const now = performance.now()
    const delay = soonestWakeMs(last.current, liveQuality, now, false, liveView)
    if (!Number.isFinite(delay)) return
    if (delay === 0 && hz === Number.POSITIVE_INFINITY) {
      markDueChannels(last.current, liveQuality, now, liveView)
      if (import.meta.env.DEV) markInv('demand-unlimited')
      rawRef.current()
      return
    }
    if (wake.current || hz <= 0) return
    const wait = delay > 0 ? delay : 1000 / hz
    wake.current = window.setTimeout(() => {
      wake.current = 0
      markDueChannels(last.current, liveQuality, performance.now(), liveView)
      if (!pumpPaused()) {
        if (import.meta.env.DEV) markInv(`demand-hz-${hz}`)
        rawRef.current()
      }
    }, wait)
  }, 100)

  return (
    <>
      <MeasureSlot />
      {/* 聚焦摘要的挂载点。drei Html 在懒包里，这里只引用 Host。 */}
      <FocusFloatHost />
      <AdaptiveQualityHost />
      <OverviewGizmoHost />
      <PickBvhSlot />
      <DemoEditHost />
      <DemoPlaqueHost />
      <WireframeHost />
      <TreeLodHost />
    </>
  )
}

/**
 * T058：摆点。只有启动地址带 ?demoEdit=1，并且已经在单层时，才在首帧 2600ms 之后 import。
 * 默认总览和默认演示都不进这条 import。
 */
const DEMO_EDIT_AFTER_FIRST_MS = 2600

function DemoEditHost() {
  const view = useTwinStore((state) => state.view)
  const [Editor, setEditor] = useState<ComponentType | null>(null)

  useEffect(() => {
    retainDemoEditParam()
  }, [])

  useEffect(() => {
    if (view !== 'floor' || !demoEditActive()) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= DEMO_EDIT_AFTER_FIRST_MS) {
        void import('../../demo-edit/DemoPointEditor').then((mod) => {
          if (!cancelled) setEditor(() => mod.DemoPointEditor)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [view])

  if (view !== 'floor' || !Editor) return null
  return <Editor />
}

/**
 * 测距工具的挂载点。实现在点击后的懒包里，这个文件不能 import 它，
 * 否则进层提前拉起 DemandLoop 时会把 Line / Html 卷进更早的请求。
 */
function MeasureSlot() {
  const [node, setNode] = useState<ReactNode>(null)
  useEffect(() => {
    window.__twinMeasureSlot = (next) => setNode(next)
    return () => {
      delete window.__twinMeasureSlot
    }
  }, [])
  return node
}

/**
 * T043：监视器不进主包。总览里 DemandLoop 自己也要等软阴影那道门，
 * 单层会更早挂上，所以这里再用同一道 2600ms 门才 import。
 * 字面量写在本文件，避免主包为了这个数字多一个导出。
 */
const ADAPTIVE_AFTER_FIRST_MS = 2600

function AdaptiveQualityHost() {
  const pinned = useTwinStore((state) => state.qualityPinned || state.downgradeSuppressed)
  const [Monitor, setMonitor] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (pinned || window.__twinGpu?.softwareAuto) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= ADAPTIVE_AFTER_FIRST_MS) {
        void import('./AdaptiveQuality').then((mod) => {
          if (!cancelled) setMonitor(() => mod.AdaptiveQuality)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pinned])

  if (!Monitor || pinned || window.__twinGpu?.softwareAuto) return null
  return <Monitor />
}

/**
 * T050：总览方位块。drei 在独立分包里。
 * 与监视器同一道 2600ms 门再 import，躲开 hardGate / balancedFx。
 * 单层不拉这个包。
 */
function OverviewGizmoHost() {
  const view = useTwinStore((state) => state.view)
  const [Gizmo, setGizmo] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (view !== 'building') return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= ADAPTIVE_AFTER_FIRST_MS) {
        void import('../../gizmo/OrientationGizmo').then((mod) => {
          if (!cancelled) setGizmo(() => mod.OrientationGizmo)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [view])

  if (view !== 'building' || !Gizmo) return null
  return <Gizmo />
}

/**
 * T055：拾取包围树。与监视器同一道 2600ms 门再 import。
 * 总览里 DemandLoop 自己也晚于这道门，单层会更早挂上，所以这里再挡一次。
 */
function PickBvhSlot() {
  const [Host, setHost] = useState<ComponentType | null>(null)
  useEffect(() => {
    let stop = false
    let raf = 0
    const tick = () => {
      if (stop) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= PICK_BVH_AFTER_FIRST_MS) {
        void import('../../scene/pick/PickBvhHost').then((mod) => {
          if (!stop) setHost(() => mod.PickBvhHost)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      stop = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  if (!Host) return null
  return <Host />
}

/**
 * T064：演示铭牌。默认关。单层且（图层 plaques 或 ?demoEdit=1）才在首帧 2600ms 之后 import。
 * 单层会提前挂上 DemandLoop，这里再挡一次，朝向分包才不会进 hardGate / balancedFx。
 */
const PLAQUE_AFTER_FIRST_MS = 2600

function DemoPlaqueHost() {
  const view = useTwinStore((state) => state.view)
  const layers = useTwinStore((state) => state.layers)
  const want = view === 'floor' && plaquesWanted(view, layers)
  const [Plaques, setPlaques] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (!want) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= PLAQUE_AFTER_FIRST_MS) {
        void import('../../demo-edit/DemoPlaques').then((mod) => {
          if (!cancelled) setPlaques(() => mod.DemoPlaques)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [want])

  if (!want || !Plaques) return null
  return <Plaques />
}

/**
 * T063：壳 / 当前层线框。默认关，所以这条 import 不会在首屏发出。
 * 单层会提前挂上 DemandLoop，这里再等首帧 2600ms，Wireframe 和材质才可能进请求。
 * 与 T060 Edges 的门闩在 latch：两边都开时不挂本组件。
 */
const WIRE_AFTER_FIRST_MS = 2600

function WireframeHost() {
  const on = useTwinStore((state) => wireframeOverlayOn(state.layers))
  const [View, setView] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (!on) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= WIRE_AFTER_FIRST_MS) {
        void import('../../scene/wire/ShellWireframe').then((mod) => {
          if (!cancelled) setView(() => mod.ShellWireframe)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [on])

  if (!on || !View) return null
  return <View />
}

/**
 * T073：行道树 hi/lo 已经成对。均衡和高画质在首帧 2600ms 之后用 drei Detailed，
 * 距离与走廊人物一样是 [0, 80]。性能档和白模不 import，避免把精细树和 Detailed 拉进首屏。
 * 单层会提前挂上 DemandLoop，这里再等首帧，TreeLod 才可能进请求。
 * 灯、屋面字和程序家具没有 lo，不造空壳。东立面格栅保持自己的近远切换。
 */
const TREE_LOD_AFTER_FIRST_MS = 2600

function TreeLodHost() {
  const quality = useTwinStore((state) => state.quality)
  const presentation = useTwinStore((state) => state.presentation)
  const enabled = quality !== 'perf' && presentation !== 'model'
  const [View, setView] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (!enabled) {
      window.__twinTreeLod = {
        on: false,
        reason: quality === 'perf' ? 'perf' : 'model',
        distances: [0, 80],
        hysteresis: 0.1,
        level: null,
        stockHidden: 0,
        hiFaces: 0,
        loFaces: 0,
      }
      return
    }
    if (!View) {
      window.__twinTreeLod = {
        on: false,
        reason: 'wait',
        distances: [0, 80],
        hysteresis: 0.1,
        level: null,
        stockHidden: 0,
        hiFaces: 0,
        loFaces: 0,
      }
    }
  }, [enabled, presentation, quality, View])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let raf = 0
    const tick = () => {
      if (cancelled) return
      const first = window.__twinFirstFrameAt
      if (first != null && performance.now() - first >= TREE_LOD_AFTER_FIRST_MS) {
        void import('../../scene/props/TreeLod').then((mod) => {
          if (!cancelled) setView(() => mod.TreeLod)
        })
        return
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
    }
  }, [enabled])

  if (!enabled || !View) return null
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  )
}

export default DemandLoop
// T078：远距装饰密模的粗拾取。生产构建在 DemandLoop 哈希前摘掉这段，哈希定稿后再接独立分包。
void import('../../scene/pick/meshBoundsMount').then((mod) => {
  mod.mountCoarseMeshBounds()
})
