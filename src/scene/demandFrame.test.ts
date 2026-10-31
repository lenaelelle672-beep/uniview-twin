import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pumpUntilSettled } from '../focus-fit/plan'
import { DEMAND_FRAME_SOURCE_BLOCK, builtDemandFrame } from '../../scripts/demandFramePlugin'
import {
  askFrame,
  bindDemandFrame,
  blockSettledFloorInvalidate,
  demandFrameReady,
  demandFrameSnapshot,
  demandInvalidate,
  guardDemandInvalidate,
  holdDemandFrame,
  markStationDemandMotion,
  resetDemandFrame,
  resumeDemandFrame,
} from './demandFrame'
import {
  badgeNeedsFrame,
  emptySyncMemory,
  explodeTarget,
  syncDemandSources,
  type SyncMemory,
} from './demandFrameMount'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

afterEach(() => {
  resetDemandFrame()
  vi.unstubAllGlobals()
})

function installRaf() {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return frames
}

function flush(frames: FrameRequestCallback[], index: number) {
  const cb = frames[index]
  if (!cb) throw new Error(`missing frame ${index}`)
  cb(0)
}

describe('共用 demand 续帧', () => {
  it('同一帧多路只排一次 rAF，调用栈上不 invalidate', () => {
    const frames = installRaf()
    const kick = vi.fn()
    expect(demandFrameReady()).toBe(false)
    bindDemandFrame(kick)
    expect(demandFrameReady()).toBe(true)
    askFrame('slider')
    demandInvalidate('badge')
    askFrame('fit')
    expect(frames).toHaveLength(1)
    expect(kick).not.toHaveBeenCalled()
    flush(frames, 0)
    expect(kick).toHaveBeenCalledTimes(1)
    expect(demandFrameSnapshot().last.sort()).toEqual(['badge', 'fit', 'slider'])
    expect(frames).toHaveLength(1)
    expect(demandFrameSnapshot().spinning).toBe(false)
  })

  it('没有 rAF 时改走微任务，仍然不在当前栈上 invalidate', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const kick = vi.fn()
    bindDemandFrame(kick)
    askFrame('slider')
    expect(kick).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(kick).toHaveBeenCalledTimes(1)
    expect(demandFrameSnapshot().spinning).toBe(false)
  })

  it('持有期间续帧，松开后只再补一帧就停', () => {
    const frames = installRaf()
    const kick = vi.fn()
    bindDemandFrame(kick)
    const release = holdDemandFrame('fit')
    flush(frames, 0)
    flush(frames, 1)
    flush(frames, 2)
    expect(kick).toHaveBeenCalledTimes(3)
    expect(demandFrameSnapshot().holds.fit).toBe(1)
    release()
    release()
    flush(frames, 3)
    expect(kick).toHaveBeenCalledTimes(4)
    expect(frames).toHaveLength(4)
    expect(demandFrameSnapshot().spinning).toBe(false)
    expect(demandFrameSnapshot().holds.fit).toBe(0)
  })

  it('在 kick 里松开时再补一帧，然后停', () => {
    const frames = installRaf()
    let release = () => {}
    const kick = vi.fn(() => release())
    bindDemandFrame(kick)
    release = holdDemandFrame('slider')
    flush(frames, 0)
    flush(frames, 1)
    expect(kick).toHaveBeenCalledTimes(2)
    expect(frames).toHaveLength(2)
    expect(demandFrameSnapshot().spinning).toBe(false)
  })

  it('入口没绑上时有限重试，绑上后补一帧并停', () => {
    const frames = installRaf()
    askFrame('badge')
    for (let index = 0; index < frames.length && index < 20; index += 1) flush(frames, index)
    expect(frames).toHaveLength(9)
    const kick = vi.fn()
    bindDemandFrame(kick)
    expect(frames).toHaveLength(10)
    flush(frames, 9)
    expect(kick).toHaveBeenCalledTimes(1)
    expect(frames).toHaveLength(10)
    expect(demandFrameSnapshot().spinning).toBe(false)
  })

  it('标签页隐藏时不续，回到前台再补一帧', () => {
    const frames = installRaf()
    const kick = vi.fn()
    bindDemandFrame(kick)
    const visibility = { state: 'hidden' }
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibility.state
      },
    })
    askFrame('slider')
    flush(frames, 0)
    expect(kick).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    visibility.state = 'visible'
    resumeDemandFrame()
    flush(frames, 1)
    expect(kick).toHaveBeenCalledTimes(1)
    expect(demandFrameSnapshot().spinning).toBe(false)
  })

  it('fit 走共用持有，结束后不再自转', async () => {
    const frames = installRaf()
    const kick = vi.fn()
    bindDemandFrame(kick)
    const timers: Array<() => void> = []
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void) => {
        timers.push(fn)
        return timers.length
      },
      clearTimeout: () => {},
      __twinDemandFrame: {
        ready: () => demandFrameReady(),
        hold: holdDemandFrame,
        askFrame,
        demandInvalidate,
        status: demandFrameSnapshot,
      },
    })
    const marks: string[] = []
    const done = Promise.resolve('rest')
    const stop = pumpUntilSettled(done, () => marks.push('end'), () => 0)
    await done
    await Promise.resolve()
    expect(marks).toEqual(['end'])
    expect(demandFrameSnapshot().holds.fit).toBe(0)
    let guard = 0
    while (demandFrameSnapshot().spinning && guard < 6) {
      flush(frames, frames.length - 1)
      guard += 1
    }
    expect(demandFrameSnapshot().spinning).toBe(false)
    expect(guard).toBeLessThan(6)
    expect(timers).toHaveLength(1)
    stop()
  })
})

describe('工位停稳不再自续', () => {
  it('人物通道还占着时，停稳的单层丢掉下一次 invalidate', () => {
    vi.stubGlobal('window', {
      __twinView: 'floor',
      __twinStationExplode: { animating: false, progress: 1 },
      __twinSchedule: { holds: { motion: 0, people: 1, alarm: 0 } },
      __twinCameraRested: true,
    })
    const raw = vi.fn()
    const guarded = guardDemandInvalidate(raw)
    expect(blockSettledFloorInvalidate()).toBe(false)
    guarded()
    expect(raw).toHaveBeenCalledTimes(1)
    markStationDemandMotion()
    expect(blockSettledFloorInvalidate()).toBe(true)
    guarded()
    expect(raw).toHaveBeenCalledTimes(1)
    expect(guardDemandInvalidate(guarded)).toBe(guarded)
  })

  it('工位还在动、正在点、镜头未 rest、或不是单层时放行', () => {
    markStationDemandMotion()
    const raw = vi.fn()
    vi.stubGlobal('window', {
      __twinView: 'floor',
      event: { type: 'click' },
      __twinStationExplode: { animating: false, progress: 1 },
      __twinSchedule: { holds: { motion: 0, people: 1, alarm: 0 } },
    })
    guardDemandInvalidate(raw)()
    vi.stubGlobal('window', {
      __twinView: 'floor',
      __twinStationExplode: { animating: true, progress: 0.4 },
      __twinSchedule: { holds: { motion: 0, people: 1, alarm: 0 } },
    })
    guardDemandInvalidate(raw)()
    vi.stubGlobal('window', {
      __twinView: 'floor',
      __twinStationExplode: { animating: false, progress: 1 },
      __twinSchedule: { holds: { motion: 1, people: 1, alarm: 0 } },
      __twinCameraRested: false,
    })
    guardDemandInvalidate(raw)()
    vi.stubGlobal('window', {
      __twinView: 'building',
      __twinStationExplode: { animating: false, progress: 0 },
    })
    guardDemandInvalidate(raw)()
    expect(raw).toHaveBeenCalledTimes(4)
  })
})

describe('滑杆和徽标进度', () => {
  function step(
    memory: SyncMemory,
    input: { progress: number; exploded: boolean; now: number; view?: string; badge?: boolean; badgeProgress?: number },
  ) {
    const decision = syncDemandSources(
      {
        now: input.now,
        view: input.view ?? 'building',
        explodedAttr: input.exploded ? 'true' : 'false',
        explodeProgress: input.progress,
        badgeAnimating: input.badge === true,
        badgeProgress: input.badgeProgress,
      },
      memory,
    )
    return decision
  }

  it('爆炸进度在走时要帧，落到目标后只再要一帧', () => {
    let memory = emptySyncMemory()
    let decision = step(memory, { progress: 0, exploded: true, now: 0 })
    memory = decision.memory
    expect(decision.askSlider).toBe(true)
    decision = step(memory, { progress: 0.4, exploded: true, now: 200 })
    memory = decision.memory
    expect(decision.askSlider).toBe(true)
    decision = step(memory, { progress: 1, exploded: true, now: 800 })
    memory = decision.memory
    expect(decision.askSlider).toBe(true)
    decision = step(memory, { progress: 1, exploded: true, now: 900 })
    memory = decision.memory
    expect(decision.askSlider).toBe(false)
    decision = step(memory, { progress: 1, exploded: true, now: 4000 })
    expect(decision.askSlider).toBe(false)
    expect(decision.askBadge).toBe(false)
  })

  it('进度卡住就停，不一直要帧', () => {
    let memory = emptySyncMemory()
    let decision = step(memory, { progress: 0.2, exploded: true, now: 0 })
    memory = decision.memory
    expect(decision.askSlider).toBe(true)
    decision = step(memory, { progress: 0.2, exploded: true, now: 100 })
    memory = decision.memory
    expect(decision.askSlider).toBe(true)
    decision = step(memory, { progress: 0.2, exploded: true, now: 500 })
    memory = decision.memory
    expect(decision.askSlider).toBe(true)
    decision = step(memory, { progress: 0.2, exploded: true, now: 600 })
    expect(decision.askSlider).toBe(false)
  })

  it('徽标矩阵只在工位动画期间要帧，结束即停', () => {
    let memory = emptySyncMemory()
    let decision = step(memory, { progress: 0, exploded: false, now: 0, view: 'floor', badge: true, badgeProgress: 0 })
    memory = decision.memory
    expect(decision.askSlider).toBe(false)
    expect(decision.askBadge).toBe(true)
    decision = step(memory, { progress: 0, exploded: false, now: 200, view: 'floor', badge: true, badgeProgress: 0.5 })
    memory = decision.memory
    expect(decision.askBadge).toBe(true)
    decision = step(memory, { progress: 0, exploded: false, now: 800, view: 'floor', badge: false, badgeProgress: 1 })
    memory = decision.memory
    expect(decision.askBadge).toBe(true)
    decision = step(memory, { progress: 0, exploded: false, now: 900, view: 'floor', badge: false, badgeProgress: 1 })
    expect(decision.askBadge).toBe(false)
  })

  it('单层不跟楼层外壳进度', () => {
    expect(explodeTarget('floor', 'true')).toBeNull()
    expect(explodeTarget('building', 'true')).toBe(1)
    expect(explodeTarget(undefined, 'false')).toBe(0)
    const clock = { previous: null, movedAt: -1 }
    expect(badgeNeedsFrame(clock, false, 0.4, 0).moving).toBe(false)
  })
})

describe('划界与体积', () => {
  it('复用 ExplodedLayout 的 rAF 续帧，不并进 FixedFramePump，0 新依赖', async () => {
    const frame = read('./demandFrame.ts')
    const mount = read('./demandFrameMount.ts')
    const layout = read('../components/scene/ExplodedLayout.tsx')
    const adaptive = read('../components/scene/AdaptiveQuality.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    const vite = read('../../vite.config.ts')
    const station = read('../station-explode/mount.ts')
    const plan = read('../focus-fit/plan.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }

    expect(layout).toMatch(/当前 useFrame 里同步 invalidate 不一定能排到下一帧/)
    expect(layout).toMatch(/requestAnimationFrame/)
    expect(frame).toMatch(/FixedFramePump/)
    expect(frame).not.toMatch(/from ['"][^'"]*AdaptiveQuality/)
    expect(frame).not.toMatch(/setFrameloop|frameloop\s*=\s*['"]always['"]/)
    expect(frame).not.toMatch(/gsap|anime|@react-spring/)
    expect(mount).not.toMatch(/from ['"]three['"]|from ['"]zustand['"]|from ['"]gsap|from ['"]anime/)
    expect(mount).not.toMatch(/FixedFramePump\(|PerformanceMonitor/)
    expect(adaptive).toMatch(/function FixedFramePump/)
    expect(adaptive).toMatch(/useFrame\(\(\) => \{\s*noteAdaptivePumpFrame\(\)\s*invalidate\(\)/)
    expect(adaptive).not.toMatch(/demandFrame/)
    expect(loop).toContain(DEMAND_FRAME_SOURCE_BLOCK)
    expect(loop).not.toMatch(/from ['"][^'"]*demandFrame/)
    expect(vite).toMatch(/demandFrameAfterHash\(\)/)
    expect(station).toMatch(/__twinDemandFrame/)
    expect(station).toMatch(/askFrame\('badge'\)/)
    expect(station).toMatch(/requestAnimationFrame/)
    expect(station).not.toMatch(/from 'three'|gsap|anime/)
    expect(plan).toMatch(/hold\('fit'\)/)
    expect(plan).not.toMatch(/@react-three|from 'three'|FogExp2|smoothTime/)
    expect(pkg.dependencies.gsap).toBeUndefined()
    expect(pkg.dependencies.animejs).toBeUndefined()
    expect(pkg.dependencies['@react-spring/three']).toBeUndefined()
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@react-three/drei',
      '@react-three/fiber',
      '@react-three/postprocessing',
      'postprocessing',
      'react',
      'react-dom',
      'three',
      'troika-three-text',
      'troika-three-utils',
      'troika-worker-utils',
      'zustand',
    ])

    const built = await builtDemandFrame()
    expect(built).toContain('mountDemandFrame')
    expect(built).toContain('requestAnimationFrame')
    expect(built).not.toMatch(/gsap|animejs|FixedFramePump|FogExp2|smoothTime|setFrameloop/)
    expect(built.length).toBeLessThan(20_000)
  })
})
