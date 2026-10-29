/**
 * 与 T032 AssetLoadOverlay、楼层壳、T089 同一道首帧窗口。
 * 不 import softShadows：晚加载包若再拉 three，会打出第二份类。
 * 数值必须等于 SOFT_SHADOW_CHUNK_AFTER_FIRST_MS。
 */
export const SHADER_PRELOAD_AFTER_FIRST_MS = 2600

/** 窗口前不挂 drei Preload，避免首帧前同步 gl.compile。 */
export function shaderPreloadDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (typeof now !== 'number' || !Number.isFinite(now)) return false
  return now - firstFrameAt >= SHADER_PRELOAD_AFTER_FIRST_MS
}
