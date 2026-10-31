/**
 * 楼层工位爆炸的取景门闩。和 cameraTransition 共用同一条口径：
 * 爆炸 fit 保持瞬时（enableTransition = false），不在补间里改距离上限。
 * 函数放在独立文件里，只有 FloorStageCamera 会引进来，不进首屏包。
 * T094 的进度滑杆也走这里，不要在滑杆上再写一份节流。
 */

/** 中间进度两次 fit 的最短间隔。端点 0 / 1 不受这个限制。 */
export const EXPLODE_FIT_SCRUB_MS = 240

/** 中间进度至少跨过这么多才再 fit。避免 scrub 每帧 fitToBox 把轨道卡住。 */
export const EXPLODE_FIT_PROGRESS_STEP = 0.08

/** 炸开后希望主体约占画面宽的比例。和楼板取景同一口径。 */
export const EXPLODE_FIT_WIDTH_TARGET = 0.78

const WIDTH_LOOSE = 0.7
const WIDTH_TIGHT = 0.92

export type ExplodeFitKind = 'open' | 'scrub' | 'close'

export interface ExplodeFitSample {
  view: string
  /** 工位爆炸开着，而且当前就在楼层里。 */
  active: boolean
  progress: number
  /** 0.8 秒补间还没走完。这段时间不 fit，等落定或 scrub 停住。 */
  animating: boolean
  now: number
  /**
   * 书签视角、导览巡游或沿轨播放占着镜头。
   * 占着的时候不 fit，也不改标记，松手后还能补一次。
   */
  held: boolean
  floorId: string
  width: number
  height: number
}

export interface ExplodeFitMark {
  progress: number
  at: number
  floorId: string
  width: number
  height: number
  /** 已经对收拢或全开取过景。 */
  settled: boolean
}

export interface ExplodeFitDecision {
  fit: boolean
  kind: ExplodeFitKind | ''
  mark: ExplodeFitMark | null
}

export function explodeFitHeld(flags: {
  viewpointHeld?: boolean
  touring?: boolean
  railPlaying?: boolean
}): boolean {
  return flags.viewpointHeld === true || flags.touring === true || flags.railPlaying === true
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function sameView(mark: ExplodeFitMark, sample: ExplodeFitSample): boolean {
  return mark.floorId === sample.floorId && mark.width === sample.width && mark.height === sample.height
}

function stamp(sample: ExplodeFitSample, progress: number, settled: boolean): ExplodeFitMark {
  return {
    progress,
    at: sample.now,
    floorId: sample.floorId,
    width: sample.width,
    height: sample.height,
    settled,
  }
}

const idle: ExplodeFitDecision = { fit: false, kind: '', mark: null }

/**
 * 同一次渲染回调之后还要再读一次工位时钟。
 * 补间帧里时钟往往更晚才写成 progress 1，停稳后不再要帧。
 * 1920 昼景这时镜头已经 rest，空闲门不会再交帧；open 还没登记就不能把 fit 留到下一帧。
 */
export function stationExplodeFitTailDue(
  stats: { animating?: boolean; active?: boolean; progress?: number } | null | undefined,
  mark: { settled?: boolean; progress?: number } | null | undefined,
): boolean {
  if (stats?.animating === true) return true
  if (stats?.active !== true || (stats.progress ?? 0) < 1) return false
  return !(mark?.settled === true && mark.progress === 1)
}

/**
 * 这一帧要不要为工位爆炸重算 fit。
 * 全开和收拢各放行一次，调用方应先刷新包围盒再 fit。
 * 中间进度（scrub）按时间和步长节流。
 * 还没炸开过时，进度 0 不 fit，进层仍走原来的楼板取景。
 */
export function nextStationExplodeFit(sample: ExplodeFitSample, mark: ExplodeFitMark | null): ExplodeFitDecision {
  if (sample.view !== 'floor') return idle
  if (sample.held || !Number.isFinite(sample.now)) return { fit: false, kind: '', mark }
  const progress = clamp01(sample.progress)

  if (!sample.active) {
    if (sample.animating || progress > 0) return { fit: false, kind: '', mark }
    if (mark == null || mark.progress === 0) return { fit: false, kind: '', mark: null }
    return { fit: true, kind: 'close', mark: stamp(sample, 0, true) }
  }

  if (sample.animating && progress < 1) return { fit: false, kind: '', mark }

  if (progress >= 1) {
    if (mark?.settled === true && mark.progress === 1 && sameView(mark, sample)) {
      return { fit: false, kind: '', mark }
    }
    return { fit: true, kind: 'open', mark: stamp(sample, 1, true) }
  }

  if (progress <= 0) {
    if (mark == null || mark.progress === 0) return { fit: false, kind: '', mark: mark?.progress === 0 ? mark : null }
    return { fit: true, kind: 'close', mark: stamp(sample, 0, true) }
  }

  if (mark != null && !sameView(mark, sample)) {
    return { fit: true, kind: 'scrub', mark: stamp(sample, progress, false) }
  }

  if (mark == null) {
    if (progress >= EXPLODE_FIT_PROGRESS_STEP) {
      return { fit: true, kind: 'scrub', mark: stamp(sample, progress, false) }
    }
    return { fit: false, kind: '', mark: stamp(sample, 0, false) }
  }

  if (sample.now - mark.at < EXPLODE_FIT_SCRUB_MS) return { fit: false, kind: '', mark }
  if (Math.abs(progress - mark.progress) < EXPLODE_FIT_PROGRESS_STEP) return { fit: false, kind: '', mark }
  return { fit: true, kind: 'scrub', mark: stamp(sample, progress, false) }
}

/** 画面里的主体太小或贴边时，返回下一次 dolly 的距离。已经可读则返回 null。 */
export function explodeFitDollyDistance(distance: number, widthRatio: number): number | null {
  if (!(distance > 0) || !(widthRatio > 0.05)) return null
  if (widthRatio >= WIDTH_LOOSE && widthRatio <= WIDTH_TIGHT) return null
  const next = distance * (widthRatio / EXPLODE_FIT_WIDTH_TARGET)
  if (!Number.isFinite(next) || next <= 0) return null
  return next
}
