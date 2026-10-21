/**
 * 演示截止时刻：2026-09-28 18:00（东八区）。
 * 告警时间由设备编号稳定散列，刷新不变。这不是出现/恢复时刻。
 */
export const DEMO_END_MS = Date.UTC(2026, 8, 28, 10, 0, 0)
const WINDOW_MINUTES = 7 * 24 * 60

export function stableEpochMs(key: string): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const minutesAgo = (hash >>> 0) % WINDOW_MINUTES
  return DEMO_END_MS - minutesAgo * 60_000
}

export function formatAlarmTime(epochMs: number): string {
  const shifted = new Date(epochMs + 8 * 60 * 60 * 1000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hour = String(shifted.getUTCHours()).padStart(2, '0')
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

export function formatChinaTime(epochMs: number): string {
  return `${formatAlarmTime(epochMs)}:00`
}
