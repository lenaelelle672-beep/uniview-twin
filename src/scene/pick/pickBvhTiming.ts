import { useEffect, useState } from 'react'

/**
 * 与软阴影 / 楼层壳同一道门。d126 cutoff 在首帧后约 64ms，
 * 锁机还会把首帧后几百毫秒的请求算进 hardGate。2600ms 再拉 three-mesh-bvh。
 */
export const PICK_BVH_AFTER_FIRST_MS = 2600

export function pickBvhDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (firstFrameAt == null || !Number.isFinite(firstFrameAt) || !Number.isFinite(now)) return false
  return now - firstFrameAt >= PICK_BVH_AFTER_FIRST_MS
}

let measureOn = false
const listeners = new Set<() => void>()

export function measurePickActive(): boolean {
  return measureOn
}

export function setMeasurePickActive(on: boolean): void {
  if (measureOn === on) return
  measureOn = on
  if (typeof window !== 'undefined') window.__twinMeasureOn = on
  listeners.forEach((listener) => listener())
}

export function subscribeMeasurePick(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetMeasurePickForTests(): void {
  measureOn = false
  listeners.clear()
  if (typeof window !== 'undefined') delete window.__twinMeasureOn
}

export function useMeasurePickActive(): boolean {
  const [on, setOn] = useState(measureOn)
  useEffect(() => subscribeMeasurePick(() => setOn(measureOn)), [])
  return on
}
