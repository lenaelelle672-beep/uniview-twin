import type { QualityTier } from '../types'
import { gpuTierLabel } from './gpuDetect'
import { lowerQualityTier, qualityTierRank, raiseQualityTier, resolveQualityDpr } from './quality'

/**
 * T043 采样策略（frameloop 保持 demand）。
 *
 * drei PerformanceMonitor 在 useFrame 里用「窗口内真实提交帧数 / 墙钟」算 FPS。
 * demand 空闲时几乎不提交；告警 2Hz、人物 30Hz 这种人为限帧会把 FPS 算成 2 或 30，
 * 从而误降档。因此：
 *
 * 1. 监视器默认不挂。稀疏 demand 帧不会进入采样。
 * 2. 固定连续窗口：挂一个只负责 invalidate 的泵。泵在 useFrame 里再要一帧，
 *    R3F 会连续提交，墙钟 FPS 才可信。不调用 setFrameloop：那会把 THREE.Clock 归零，
 *    人物和爆炸用的是 elapsedTime。
 * 3. 已经在无限 Hz（均衡/高画质的镜头运动）时不再开泵，直接采样这段重负载。
 *    有限 Hz（0/2/10/30）一律不当成样本。运动中途停了就丢弃半窗。
 * 4. 开窗前有热身，编译帧不进平均数。快机约 2 秒攒满 8 桶；慢机桶更长，窗口最多等 6 秒。
 *    低于 30 的桶超过 75% 才降，对齐「持续低于 30 才降」。
 * 5. 滞回：死区不升不降；降一档只要 1 个坏窗；升档要连续 2 个好窗，且不超过开测时的档位
 *    （默认均衡不会被抬到高画质）。换档后静默 8 秒。来回反转两次就冻结在当前档。
 * 6. ?q= 或手动选档之后整段卸载，不再自动改 DPR / 阴影。
 */

export const ADAPTIVE_SAMPLE_MS = 250
/**
 * 快机上 8×250ms ≈ 2 秒。慢机每一桶要等下一帧跨过 250ms，桶更长。
 * 窗口留足 6 秒，避免 3fps 还没攒满桶就被判成「稳定」。
 */
export const ADAPTIVE_ITERATIONS = 8
export const ADAPTIVE_THRESHOLD = 0.75
export const ADAPTIVE_WINDOW_MS = 6_000
export const ADAPTIVE_WARMUP_MS = 600
/** 相对 AdaptiveQuality 挂上的时刻，不是首帧。挂上本身已经晚于首帧 2600ms。 */
export const ADAPTIVE_FIRST_PROBE_DELAY_MS = 4_000
export const ADAPTIVE_PROBE_GAP_MS = 12_000
export const ADAPTIVE_DWELL_MS = 8_000
export const ADAPTIVE_DECLINE_STREAK = 1
export const ADAPTIVE_INCLINE_STREAK = 2
export const ADAPTIVE_MAX_REVERSALS = 2
/** 固定窗口里泵帧少于此数，说明 demand 没被连续拉起来，整窗作废。 */
export const ADAPTIVE_MIN_PUMP_FRAMES = 3

export type AdaptiveSignal = 'decline' | 'incline' | 'steady'
export type AdaptiveSampleMode = 'off' | 'fixed-window' | 'unthrottled-load'
export type AdaptivePhase = 'idle' | 'warmup' | 'fixed-window' | 'unthrottled-load'

export function adaptiveFpsBounds(refreshrate: number): [number, number] {
  // 高刷下把死区上沿抬高，避免 60fps 被当成「不够高」而抖动。
  if (refreshrate > 100) return [40, 72]
  return [30, 50]
}

/**
 * 与 drei PerformanceMonitor 同一条判定：某一侧命中次数 > iterations × threshold。
 * 两侧同时命中时降档优先。
 */
export function adaptiveMonitorSignal(
  averages: readonly number[],
  refreshrate: number,
  threshold = ADAPTIVE_THRESHOLD,
): 'decline' | 'incline' | null {
  if (averages.length === 0) return null
  const [lower, upper] = adaptiveFpsBounds(refreshrate)
  const limit = averages.length * threshold
  let lowerHits = 0
  let upperHits = 0
  for (const value of averages) {
    if (value < lower) lowerHits += 1
    if (value >= upper) upperHits += 1
  }
  if (lowerHits > limit) return 'decline'
  if (upperHits > limit) return 'incline'
  return null
}

export function normalizeScheduledHz(hz: number | undefined): number {
  if (hz === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) return 0
  return hz
}

export function readLiveScheduledHz(): number {
  const host = globalThis as unknown as Window
  return normalizeScheduledHz(host.__twinSchedule?.hz)
}

/**
 * 只有固定连续窗口，或已经无限 Hz 的重负载，才允许挂 PerformanceMonitor。
 * 热身和隐藏标签页都不采样。
 */
export function resolveSampleMode(input: {
  hidden: boolean
  phase: AdaptivePhase
  scheduledHz: number
}): AdaptiveSampleMode {
  if (input.hidden || input.phase === 'idle' || input.phase === 'warmup') return 'off'
  if (input.phase === 'fixed-window') return 'fixed-window'
  if (input.scheduledHz === Number.POSITIVE_INFINITY) return 'unthrottled-load'
  return 'off'
}

export function acceptAdaptiveSample(input: {
  mode: 'fixed-window' | 'unthrottled-load'
  signal: AdaptiveSignal
  pumpFrames: number
}): AdaptiveSignal | null {
  if (input.mode === 'fixed-window' && input.pumpFrames < ADAPTIVE_MIN_PUMP_FRAMES) return null
  return input.signal
}

export function phaseActivity(phase: AdaptivePhase): { pump: boolean; monitor: boolean } {
  if (phase === 'warmup' || phase === 'fixed-window') return { pump: true, monitor: phase === 'fixed-window' }
  if (phase === 'unthrottled-load') return { pump: false, monitor: true }
  return { pump: false, monitor: false }
}

export function adaptiveAdjustmentsAllowed(input: {
  qualityPinned: boolean
  downgradeSuppressed: boolean
  software: boolean
}): boolean {
  return !input.qualityPinned && !input.downgradeSuppressed && !input.software
}

export type AdaptiveMemory = {
  ceiling: QualityTier
  good: number
  bad: number
  lastDirection: 'decline' | 'incline' | null
  reversals: number
  changedAt: number | null
  frozen: boolean
}

export function initialAdaptiveMemory(ceiling: QualityTier): AdaptiveMemory {
  return {
    ceiling,
    good: 0,
    bad: 0,
    lastDirection: null,
    reversals: 0,
    changedAt: null,
    frozen: false,
  }
}

let memory: AdaptiveMemory | null = null
let pumpFrames = 0

/** 只由固定窗口的泵调用。稀疏 demand 帧不会进这个计数。 */
export function noteAdaptivePumpFrame(): void {
  pumpFrames += 1
}

export function readAdaptivePumpFrames(): number {
  return pumpFrames
}

export function resetAdaptivePumpFrames(): void {
  pumpFrames = 0
}

export function ensureAdaptiveMemory(ceiling: QualityTier): AdaptiveMemory {
  if (!memory) memory = initialAdaptiveMemory(ceiling)
  return memory
}

export function readAdaptiveMemory(): AdaptiveMemory | null {
  return memory
}

export function writeAdaptiveMemory(next: AdaptiveMemory): void {
  memory = next
}

export function resetAdaptiveMemoryForTests(): void {
  memory = null
  pumpFrames = 0
}

export function decideAdaptiveTier(
  current: AdaptiveMemory,
  quality: QualityTier,
  signal: AdaptiveSignal,
  now: number,
): { memory: AdaptiveMemory; quality: QualityTier; applied: 'decline' | 'incline' | null } {
  if (current.frozen) return { memory: current, quality, applied: null }
  if (current.changedAt != null && now - current.changedAt < ADAPTIVE_DWELL_MS) {
    return { memory: current, quality, applied: null }
  }

  let good = current.good
  let bad = current.bad
  if (signal === 'incline') {
    good += 1
    bad = 0
  } else if (signal === 'decline') {
    bad += 1
    good = 0
  } else {
    good = 0
    bad = 0
  }

  let next = quality
  let applied: 'decline' | 'incline' | null = null
  if (bad >= ADAPTIVE_DECLINE_STREAK) {
    const lowered = lowerQualityTier(quality)
    if (lowered !== quality) {
      next = lowered
      applied = 'decline'
    }
  } else if (good >= ADAPTIVE_INCLINE_STREAK && qualityTierRank(quality) < qualityTierRank(current.ceiling)) {
    const raised = raiseQualityTier(quality)
    if (raised !== quality && qualityTierRank(raised) <= qualityTierRank(current.ceiling)) {
      next = raised
      applied = 'incline'
    }
  }

  if (!applied) return { memory: { ...current, good, bad }, quality, applied: null }

  const reversed = current.lastDirection != null && current.lastDirection !== applied
  const reversals = current.reversals + (reversed ? 1 : 0)
  return {
    memory: {
      ...current,
      good: 0,
      bad: 0,
      lastDirection: applied,
      reversals,
      changedAt: now,
      frozen: reversals >= ADAPTIVE_MAX_REVERSALS,
    },
    quality: next,
    applied,
  }
}

export type AdaptiveStatus = {
  mode: AdaptivePhase
  sampling: boolean
  ceiling: QualityTier
  frozen: boolean
  lastSignal: AdaptiveSignal | null
  lastApplied: 'decline' | 'incline' | null
  lastFps: number | null
  /** 本窗泵提交的帧数。0 表示固定窗口没有真正连续起来，样本作废。 */
  pumpFrames: number
  at: number
}

export function publishAdaptiveStatus(patch: Partial<AdaptiveStatus> & Pick<AdaptiveStatus, 'mode' | 'sampling'>): void {
  const host = globalThis as unknown as Window
  const prev = host.__twinAdaptive
  const ceiling = patch.ceiling ?? prev?.ceiling ?? readAdaptiveMemory()?.ceiling ?? 'balanced'
  host.__twinAdaptive = {
    mode: patch.mode,
    sampling: patch.sampling,
    ceiling,
    frozen: patch.frozen ?? prev?.frozen ?? false,
    lastSignal: patch.lastSignal === undefined ? (prev?.lastSignal ?? null) : patch.lastSignal,
    lastApplied: patch.lastApplied === undefined ? (prev?.lastApplied ?? null) : patch.lastApplied,
    lastFps: patch.lastFps === undefined ? (prev?.lastFps ?? null) : patch.lastFps,
    pumpFrames: patch.pumpFrames === undefined ? (prev?.pumpFrames ?? 0) : patch.pumpFrames,
    at: typeof performance === 'undefined' ? 0 : performance.now(),
  }
}

export function stampGpuTier(quality: QualityTier, devicePixelRatio?: number): void {
  const host = globalThis as unknown as Window
  const gpu = host.__twinGpu
  if (!gpu) return
  gpu.tier = gpuTierLabel(quality)
  if (gpu.software) return
  const dpr = devicePixelRatio ?? host.devicePixelRatio ?? 1
  gpu.dpr = resolveQualityDpr(quality, dpr)
}
