import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetTwinStore, useTwinStore } from '../store/store'
import {
  ADAPTIVE_DECLINE_STREAK,
  ADAPTIVE_DWELL_MS,
  ADAPTIVE_INCLINE_STREAK,
  ADAPTIVE_ITERATIONS,
  ADAPTIVE_THRESHOLD,
  ADAPTIVE_WINDOW_MS,
  ADAPTIVE_MIN_PUMP_FRAMES,
  acceptAdaptiveSample,
  adaptiveAdjustmentsAllowed,
  adaptiveFpsBounds,
  adaptiveMonitorSignal,
  decideAdaptiveTier,
  inclineAdaptiveQuality,
  initialAdaptiveMemory,
  normalizeScheduledHz,
  phaseActivity,
  resetAdaptiveMemoryForTests,
  resolveSampleMode,
  stampGpuTier,
  type AdaptiveSignal,
} from './adaptiveQuality'
import type { QualityTier } from '../types'

const here = dirname(fileURLToPath(import.meta.url))

describe('demand 下什么时候允许采样', () => {
  it('稀疏和有限 Hz 不采样', () => {
    expect(resolveSampleMode({ hidden: false, phase: 'idle', scheduledHz: 0 })).toBe('off')
    expect(resolveSampleMode({ hidden: false, phase: 'warmup', scheduledHz: Number.POSITIVE_INFINITY })).toBe('off')
    expect(resolveSampleMode({ hidden: false, phase: 'idle', scheduledHz: 2 })).toBe('off')
    expect(resolveSampleMode({ hidden: false, phase: 'idle', scheduledHz: 30 })).toBe('off')
    expect(resolveSampleMode({ hidden: true, phase: 'fixed-window', scheduledHz: 0 })).toBe('off')
    expect(resolveSampleMode({ hidden: false, phase: 'unthrottled-load', scheduledHz: 30 })).toBe('off')
    expect(resolveSampleMode({ hidden: false, phase: 'unthrottled-load', scheduledHz: 0 })).toBe('off')
  })

  it('固定连续窗口，以及已经无限 Hz 的重负载，才采样', () => {
    expect(resolveSampleMode({ hidden: false, phase: 'fixed-window', scheduledHz: 0 })).toBe('fixed-window')
    expect(resolveSampleMode({ hidden: false, phase: 'unthrottled-load', scheduledHz: Number.POSITIVE_INFINITY })).toBe(
      'unthrottled-load',
    )
    expect(normalizeScheduledHz(undefined)).toBe(0)
    expect(normalizeScheduledHz(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
    expect(normalizeScheduledHz(30)).toBe(30)
  })

  it('固定窗口泵帧不够就丢掉样本，无限 Hz 不看泵', () => {
    expect(ADAPTIVE_MIN_PUMP_FRAMES).toBeGreaterThan(1)
    expect(acceptAdaptiveSample({ mode: 'fixed-window', signal: 'decline', pumpFrames: 0 })).toBeNull()
    expect(acceptAdaptiveSample({ mode: 'fixed-window', signal: 'decline', pumpFrames: 2 })).toBeNull()
    expect(acceptAdaptiveSample({ mode: 'fixed-window', signal: 'decline', pumpFrames: 3 })).toBe('decline')
    expect(acceptAdaptiveSample({ mode: 'unthrottled-load', signal: 'incline', pumpFrames: 0 })).toBe('incline')
  })

  it('热身只开泵，不挂监视器；固定窗口两样都开；无限 Hz 只挂监视器', () => {
    expect(phaseActivity('idle')).toEqual({ pump: false, monitor: false })
    expect(phaseActivity('warmup')).toEqual({ pump: true, monitor: false })
    expect(phaseActivity('fixed-window')).toEqual({ pump: true, monitor: true })
    expect(phaseActivity('unthrottled-load')).toEqual({ pump: false, monitor: true })
  })
})

describe('PerformanceMonitor 的档位判定', () => {
  const bad = Array.from({ length: ADAPTIVE_ITERATIONS }, () => 18)
  const good = Array.from({ length: ADAPTIVE_ITERATIONS }, () => 60)
  const mid = Array.from({ length: ADAPTIVE_ITERATIONS }, () => 40)

  it('60Hz 死区是 30 到 50，高刷把上沿抬到 72', () => {
    expect(adaptiveFpsBounds(60)).toEqual([30, 50])
    expect(adaptiveFpsBounds(100)).toEqual([30, 50])
    expect(adaptiveFpsBounds(144)).toEqual([40, 72])
  })

  it('要超过 iterations × threshold 才升或降', () => {
    expect(adaptiveMonitorSignal(bad, 60)).toBe('decline')
    expect(adaptiveMonitorSignal(good, 60)).toBe('incline')
    expect(adaptiveMonitorSignal(mid, 60)).toBeNull()
    const limit = ADAPTIVE_ITERATIONS * ADAPTIVE_THRESHOLD
    const almost = [
      ...Array.from({ length: limit }, () => 10),
      ...Array.from({ length: ADAPTIVE_ITERATIONS - limit }, () => 60),
    ]
    expect(almost.filter((value) => value < 30).length).toBe(limit)
    expect(adaptiveMonitorSignal(almost, 60)).toBeNull()
    expect(ADAPTIVE_WINDOW_MS).toBeGreaterThan(ADAPTIVE_ITERATIONS * 250)
  })
})

describe('滞回', () => {
  function run(signals: Array<{ signal: AdaptiveSignal; dt: number }>, ceiling: QualityTier = 'balanced', start: QualityTier = ceiling) {
    let memory = initialAdaptiveMemory(ceiling)
    let quality: QualityTier = start
    let now = 0
    const applied: Array<'decline' | 'incline' | null> = []
    for (const step of signals) {
      now += step.dt
      const result = decideAdaptiveTier(memory, quality, step.signal, now)
      memory = result.memory
      quality = result.quality
      applied.push(result.applied)
    }
    return { memory, quality, applied }
  }

  it('坏窗降一档，死区清掉连续计数，好窗要够两次才升，且不超过开测档', () => {
    expect(ADAPTIVE_DECLINE_STREAK).toBe(1)
    expect(ADAPTIVE_INCLINE_STREAK).toBe(2)
    const result = run([
      { signal: 'decline', dt: 1_000 },
      { signal: 'steady', dt: ADAPTIVE_DWELL_MS },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
    ])
    expect(result.applied).toEqual(['decline', null, null, 'incline', null])
    expect(result.quality).toBe('balanced')
    expect(result.memory.ceiling).toBe('balanced')
  })

  it('换档后的静默期内不累计、不抖动', () => {
    const result = run([
      { signal: 'decline', dt: 1_000 },
      { signal: 'incline', dt: 1_000 },
      { signal: 'decline', dt: 1_000 },
    ])
    expect(result.quality).toBe('perf')
    expect(result.applied[1]).toBeNull()
    expect(result.applied[2]).toBeNull()
    expect(result.memory.good).toBe(0)
    expect(result.memory.bad).toBe(0)
  })

  it('降了又升再降就冻结，之后好窗也不再升', () => {
    const result = run([
      { signal: 'decline', dt: 1_000 },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
      { signal: 'decline', dt: ADAPTIVE_DWELL_MS },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
      { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
    ])
    expect(result.applied).toEqual(['decline', null, 'incline', 'decline', null, null])
    expect(result.quality).toBe('perf')
    expect(result.memory.frozen).toBe(true)
  })

  it('开测档是高画质时可以逐级升回去', () => {
    const result = run(
      [
        { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
        { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
        { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
        { signal: 'incline', dt: ADAPTIVE_DWELL_MS },
      ],
      'high',
      'perf',
    )
    expect(result.applied).toEqual([null, 'incline', null, 'incline'])
    expect(result.quality).toBe('high')
  })
})

describe('锁定和 GPU 戳', () => {
  beforeEach(() => {
    resetTwinStore()
    resetAdaptiveMemoryForTests()
    delete (globalThis as { __twinGpu?: unknown }).__twinGpu
  })

  it('URL 锁定、手动选档、软件渲染都不自动改档', () => {
    expect(adaptiveAdjustmentsAllowed({ qualityPinned: true, downgradeSuppressed: false, software: false })).toBe(false)
    expect(adaptiveAdjustmentsAllowed({ qualityPinned: false, downgradeSuppressed: true, software: false })).toBe(false)
    expect(adaptiveAdjustmentsAllowed({ qualityPinned: false, downgradeSuppressed: false, software: true })).toBe(false)
    expect(adaptiveAdjustmentsAllowed({ qualityPinned: false, downgradeSuppressed: false, software: false })).toBe(true)
  })

  it('未锁定时升降各一档，锁定后停住', () => {
    useTwinStore.setState({ quality: 'balanced', qualityPinned: false, downgradeSuppressed: false })
    useTwinStore.getState().declineQuality()
    expect(useTwinStore.getState().quality).toBe('perf')
    inclineAdaptiveQuality()
    expect(useTwinStore.getState().quality).toBe('balanced')
    useTwinStore.getState().setQuality('perf')
    inclineAdaptiveQuality()
    expect(useTwinStore.getState().quality).toBe('perf')
    expect(useTwinStore.getState().downgradeSuppressed).toBe(true)
  })

  it('换档后用 gpuTierLabel 写回 __twinGpu', () => {
    const host = globalThis as unknown as Window
    host.__twinGpu = {
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
      software: false,
      tier: 'balanced',
    }
    stampGpuTier('perf', 2)
    expect(host.__twinGpu?.tier).toBe('performance')
    expect(host.__twinGpu?.dpr).toBe(1)
    host.__twinGpu = { ...host.__twinGpu, software: true, dpr: 0.75 }
    stampGpuTier('high', 2)
    expect(host.__twinGpu.dpr).toBe(0.75)
    expect(host.__twinGpu.tier).toBe('high')
  })
})

describe('分包不进硬门禁静态图', () => {
  it('主包不挂监视器，DemandLoop 在软阴影同一道门之后再懒加载', () => {
    const scene = readFileSync(join(here, '../components/Scene.tsx'), 'utf8')
    const loop = readFileSync(join(here, '../components/scene/DemandLoop.tsx'), 'utf8')
    const chunk = readFileSync(join(here, '../components/scene/AdaptiveQuality.tsx'), 'utf8')
    const policy = readFileSync(join(here, 'adaptiveQuality.ts'), 'utf8')
    expect(scene).not.toMatch(/AdaptiveQuality/)
    expect(scene).not.toMatch(/from ['"][^'"]*PerformanceMonitor['"]/)
    expect(scene).not.toMatch(/import\([^)]*PerformanceMonitor/)
    expect(scene).not.toMatch(/setFrameloop/)
    expect(scene).not.toMatch(/from ['"][^'"]*adaptiveQuality['"]/)
    expect(scene).toMatch(/frameloop="demand"/)
    expect(scene).toMatch(/SOFT_SHADOW_CHUNK_AFTER_FIRST_MS/)
    expect(scene).toMatch(/gl\.toneMappingExposure = mode === 'day' \? 1\.95 : 1/)
    expect(loop).toMatch(/import\('\.\/AdaptiveQuality'\)/)
    expect(loop).toMatch(/ADAPTIVE_AFTER_FIRST_MS = 2600/)
    expect(loop).toMatch(/qualityPinned/)
    expect(loop).toMatch(/downgradeSuppressed/)
    expect(loop).toMatch(/softwareAuto/)
    expect(loop).not.toMatch(/setFrameloop/)
    expect(chunk).toMatch(/@react-three\/drei\/core\/PerformanceMonitor/)
    expect(chunk).not.toMatch(/setFrameloop/)
    expect(chunk).toMatch(/noteAdaptivePumpFrame/)
    expect(policy).toMatch(/固定连续窗口/)
    expect(policy).toMatch(/稀疏/)
    const banned = /from ['"][^'"]*(softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx)/
    expect(chunk).not.toMatch(banned)
    expect(policy).not.toMatch(banned)
    expect(policy).not.toMatch(/@react-three\/drei/)
    expect(chunk).not.toMatch(/toneMappingExposure|SOFT_SHADOW_SAMPLES|FogExp2/)
  })
})
