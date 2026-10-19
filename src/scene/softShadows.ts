import { BasicShadowMap, PCFShadowMap, type ShadowMapType } from 'three'

/**
 * drei `<SoftShadows>` 默认 samples 是 10，SwiftShader 上偏重。
 * 规格先落在 4–6。size / focus 用 drei 社区默认（25 / 0）。
 */
export const SOFT_SHADOW_SAMPLES = 5
export const SOFT_SHADOW_SIZE = 25
export const SOFT_SHADOW_FOCUS = 0

/** DemandLoop 至少画出这么多帧之后才允许开门，躲开 D286 总览当帧烘影。 */
export const SOFT_SHADOW_MIN_FRAMES = 1

/**
 * d126 hardGate 的 cutoff 在首帧后约 64ms，只晚一帧的请求会时进时出。
 * 锁机还会把首帧后几百毫秒的请求算进 hardGateFiles。
 * SoftShadows 与楼层壳同一时刻再 import，躲开这段窗口。
 */
export const SOFT_SHADOW_CHUNK_AFTER_FIRST_MS = 2600

let mounted = false

export function setSoftShadowsMounted(next: boolean): void {
  mounted = next
}

export function softShadowsMounted(): boolean {
  return mounted
}

export function resetSoftShadowsMountedForTests(): void {
  mounted = false
}

export function softShadowsQualityOn(quality: string): boolean {
  return quality !== 'perf'
}

export type SoftShadowGateInput = {
  quality: string
  firstFrameAt: number | null | undefined
  frames: number | null | undefined
  bakePending: boolean
  view: string
  cameraRested: boolean
}

export type SoftShadowChunkInput = {
  quality: string
  extrasReady: boolean
  firstFrameAt: number | null | undefined
  now: number
}

/**
 * 主包只留本文件。drei `<SoftShadows>` 在独立分包里。
 * extrasReady 可能早于首帧（预热的 compile 赶在 HDR / Suspense 之前），
 * 所以还要等过 d126 cutoff，import() 才不会进 before-cutoff。
 */
export function softShadowChunkDue(input: SoftShadowChunkInput): boolean {
  if (!softShadowsQualityOn(input.quality)) return false
  if (!input.extrasReady) return false
  if (input.firstFrameAt == null) return false
  return input.now - input.firstFrameAt >= SOFT_SHADOW_CHUNK_AFTER_FIRST_MS
}

/**
 * 总览：首帧已落，DemandLoop 至少完成一帧（这一帧带走立即烘），且没有挂起的烘影。
 * 单层还要等飞入停稳。停稳当帧若 bake 仍 pending，门继续关着。
 * 组件在门打开后再让出一帧才挂 `<SoftShadows>`，避免和 bake / 飞入同帧。
 */
export function softShadowGateOpen(input: SoftShadowGateInput): boolean {
  if (!softShadowsQualityOn(input.quality)) return false
  if (input.firstFrameAt == null) return false
  if (typeof input.frames !== 'number' || input.frames < SOFT_SHADOW_MIN_FRAMES) return false
  if (input.bakePending) return false
  if (input.view === 'floor' && !input.cameraRested) return false
  return true
}

/**
 * drei 10.7.9 在 PCSS 期间把 shadowMap.type 写成 BasicShadowMap，清理时写回挂载时抓到的值。
 * 清理后若仍是 BasicShadowMap，改回挂载前的类型。挂载前已经是 Basic 时，回到本场景
 * percentage 阴影用的 PCFShadowMap（three 0.186 里是 1）。
 */
export function shadowTypeAfterSoftShadowsUnmount(savedType: ShadowMapType, typeNow: ShadowMapType): ShadowMapType {
  if (typeNow !== BasicShadowMap) return typeNow
  if (savedType === BasicShadowMap) return PCFShadowMap
  return savedType
}

/** 只记下 PCSS 改写之前的类型。已经是 BasicShadowMap 时保留上次的值。 */
export function capturePrePcssShadowType(previous: ShadowMapType, typeNow: ShadowMapType): ShadowMapType {
  if (typeNow === BasicShadowMap) return previous
  return typeNow
}

/**
 * 均衡预热会把 shadowMap.type 写成 PCFShadowMap。
 * PCSS 挂着时这会把采样器从 sampler2D 改回 sampler2DShadow，和注入的着色器对不上。
 */
export function assignBalancedShadowType(shadowMap: { type: ShadowMapType }): void {
  if (softShadowsMounted()) return
  shadowMap.type = PCFShadowMap
}
