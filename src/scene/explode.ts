import { easing } from 'maath'

/** B1 + F1～F22。 */
export const FLOOR_COUNT = 23

/**
 * 展开后相邻两层外壳之间的净空（米）。
 * 只加在每层 group 的 position.y 上，不改楼层高度，所以净空就是这一常量乘进度。
 */
export const EXPLODE_GAP_M = 8

/**
 * B1 标高 -5.5 m，楼板在地面以下。展开时整栋再抬高这么多，
 * B1 升到地面以上，23 层都能看见。层间净空仍是 EXPLODE_GAP_M。
 */
export const EXPLODE_GROUND_CLEARANCE_M = 6

/** 拉开和收拢都走这一段时长。结束时进度精确落到 0 或 1。 */
export const EXPLODE_DURATION_S = 0.8

/**
 * 第 index 层（0 = B1，22 = F22）在进度 progress（0 收拢，1 展开）下的 Y 偏移。
 * progress 为 0 时每层都是 0，位置与未爆炸时完全一致。
 */
export function explodeOffset(index: number, progress: number): number {
  if (index < 0 || index >= FLOOR_COUNT) throw new Error('楼层序号')
  return (EXPLODE_GROUND_CLEARANCE_M + index * EXPLODE_GAP_M) * progress
}

/** 该层外壳在世界坐标里的底面和顶面。底面 = 标高 + 偏移。 */
export function floorWorldSpan(elevation: number, height: number, index: number, progress: number) {
  const bottom = elevation + explodeOffset(index, progress)
  return { bottom, top: bottom + height }
}

/**
 * 从 from 走向 to。elapsed 用秒。
 * 曲线是 maath cubic.out；满 0.8 秒后返回精确的 to，收拢结束时偏移可以回到 0。
 */
export function explodeProgress(from: number, to: number, elapsed: number): number {
  if (elapsed <= 0) return from
  if (elapsed >= EXPLODE_DURATION_S) return to
  const shaped = easing.cubic.out(elapsed / EXPLODE_DURATION_S)
  return from + (to - from) * shaped
}

/** 与 listFloorSpecs 同一序号：B1 = 0，F1 = 1，…，F22 = 22。 */
export function explodeFloorIndex(id: string): number {
  if (id === 'B1') return 0
  const level = Number(id.slice(1))
  if (!Number.isInteger(level) || level < 1 || level > FLOOR_COUNT - 1) throw new Error('楼层序号')
  return level
}

/** 徽标竖直偏移。与该层外壳一样，只调用 explodeOffset。进度 0 时为 0。 */
export function badgeExplodeOffset(floorId: string, progress: number): number {
  return explodeOffset(explodeFloorIndex(floorId), progress)
}

export interface ExplodeMotion {
  progress: number
  /** 0.8 秒展开或收拢还没走完。这段时间徽标隐藏。 */
  animating: boolean
}

interface MotionClock {
  from: number
  to: number
  start: number
  progress: number
}

let motionClock: MotionClock = { from: 0, to: 0, start: -1, progress: 0 }

/** 测试重置。运行时不要调用。 */
export function resetExplodeMotion(): void {
  motionClock = { from: 0, to: 0, start: -1, progress: 0 }
}

/**
 * 外壳和徽标共用这一份进度。同一时刻重复调用结果相同。
 * 离开总览时立刻回到 0，与原来的 ExplodedLayout 一致。
 */
export function stepExplodeMotion(exploded: boolean, view: string, now: number): ExplodeMotion {
  // 没写过 __ea 时 ?? 1，原来的布尔开关仍走到完全展开。__es 时这一下直接落到目标。
  const target = exploded && view === 'building' ? ((globalThis as { __ea?: number }).__ea ?? 1) : 0
  if (view !== 'building') {
    motionClock = { from: 0, to: 0, start: now, progress: 0 }
    return { progress: 0, animating: false }
  }
  if (motionClock.to !== target || motionClock.start < 0) {
    const from = (globalThis as { __es?: boolean }).__es ? target : motionClock.progress
    motionClock = { from, to: target, start: now, progress: explodeProgress(from, target, 0) }
  } else {
    motionClock.progress = explodeProgress(motionClock.from, motionClock.to, now - motionClock.start)
  }
  return { progress: motionClock.progress, animating: motionClock.progress !== target }
}

export function readExplodeMotion(): ExplodeMotion {
  if (motionClock.start < 0) return { progress: 0, animating: false }
  return { progress: motionClock.progress, animating: motionClock.progress !== motionClock.to }
}

let stationClock: MotionClock = { from: 0, to: 0, start: -1, progress: 0 }

/** 测试重置。运行时不要调用。楼层时钟不动。 */
export function resetStationExplodeMotion(): void {
  stationClock = { from: 0, to: 0, start: -1, progress: 0 }
}

/**
 * 工位拆解复用 explodeProgress 和 0.8 秒，但时钟与楼层外壳分开。
 * 只在单层里走向 exploded。离开楼层立刻回到 0，不再补间。
 * 徽标和标签读同一份 progress。
 */
export function stepStationExplodeMotion(exploded: boolean, view: string, now: number): ExplodeMotion {
  if (view !== 'floor') {
    stationClock = { from: 0, to: 0, start: now, progress: 0 }
    return { progress: 0, animating: false }
  }
  const target = exploded ? ((globalThis as { __ea?: number }).__ea ?? 1) : 0
  if (stationClock.to !== target || stationClock.start < 0) {
    const from = (globalThis as { __es?: boolean }).__es ? target : stationClock.progress
    stationClock = { from, to: target, start: now, progress: explodeProgress(from, target, 0) }
  } else {
    stationClock.progress = explodeProgress(stationClock.from, stationClock.to, now - stationClock.start)
  }
  return { progress: stationClock.progress, animating: stationClock.progress !== target }
}

export function readStationExplodeMotion(): ExplodeMotion {
  if (stationClock.start < 0) return { progress: 0, animating: false }
  return { progress: stationClock.progress, animating: stationClock.progress !== stationClock.to }
}
