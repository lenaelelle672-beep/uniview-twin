/**
 * 锁机 floorReadyPoller 的采样口径。
 * 闸：`__twinFrames` 已经有了，并且按 100ms 绝对桶采样（同一桶只算一次）。
 * 单层 0Hz 不再提交新帧时，同一帧可以进入下一个桶。
 * 只累计可见成员；尺度用 max(|x|,|y|)。连续 3 个桶签名不变，出齐时刻取该桶结束。
 */
export const FLOOR_READY_GAP_MS = 100
export const FLOOR_READY_VISIBLE = 0.05

export type FloorReadyMember = {
  scale?: { x?: number; y?: number }
  fillOpacity?: number
  textRenderInfo?: unknown
}

export type FloorReadyGate = {
  bucket: number | null
  at: number | null
  sig: string
  stable: number
}

export function emptyFloorReadyGate(): FloorReadyGate {
  return { bucket: null, at: null, sig: '', stable: 0 }
}

export function floorReadyExtent(member: FloorReadyMember): number {
  const x = Math.abs(member.scale?.x ?? 0)
  const y = Math.abs(member.scale?.y ?? 0)
  return Math.max(x, y)
}

export function floorReadyVisible(member: FloorReadyMember): boolean {
  return floorReadyExtent(member) > FLOOR_READY_VISIBLE
}

function clearStreak(gate: FloorReadyGate) {
  gate.sig = ''
  gate.stable = 0
}

/**
 * 淡入中或还没有成员时不消耗桶。同一桶重复调用保留已有连续计数。
 * 第三次稳定桶返回该桶结束时刻，不早于任意 ≥100ms 采样器记下的 ready。
 */
export function pollFloorReady(
  gate: FloorReadyGate,
  members: Iterable<FloorReadyMember> | null | undefined,
  fading: boolean,
  now: number,
  frames: number | null | undefined,
): number | null {
  if (fading || !members || typeof frames !== 'number' || !Number.isFinite(frames)) {
    clearStreak(gate)
    return null
  }
  const bucket = Math.floor(now / FLOOR_READY_GAP_MS)
  if (gate.bucket === bucket) return null
  gate.bucket = bucket
  gate.at = now

  let vis = 0
  let fo = 0
  let scale = 0
  let missing = false
  for (const text of members) {
    if (!floorReadyVisible(text)) continue
    vis += 1
    if (!text.textRenderInfo) missing = true
    fo += text.fillOpacity ?? 0
    scale += floorReadyExtent(text)
  }
  if (missing || vis === 0) {
    clearStreak(gate)
    return null
  }
  const sig = `${vis}|${Math.round(fo * 1000)}|${Math.round(scale * 1000)}`
  if (sig === gate.sig) gate.stable += 1
  else {
    gate.sig = sig
    gate.stable = 1
  }
  return gate.stable >= 3 ? (bucket + 1) * FLOOR_READY_GAP_MS : null
}
