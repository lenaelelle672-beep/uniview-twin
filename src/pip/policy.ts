/**
 * T083：画中画值守的纯策略。
 * 不碰 three / R3F / 雾 / 后处理，也不读全屏状态。
 * 调用方只在晚加载入口里使用。
 */

/** 值守可以开很久，所以不走 T062 的 always。2 Hz 对齐告警亮灭，只在画中画开着时补一帧。 */
export const PIP_CONTINUE_MS = 500

/** 没有 requestFrame 时的兜底采样。不用 T062 的 30fps。 */
export const PIP_FALLBACK_FPS = 2

export interface SilentVideoSink {
  muted: boolean
  volume: number
  controls: boolean
  autoplay: boolean
  playsInline: boolean
  disablePictureInPicture: boolean
}

export function pipOffFromSearch(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('nopip') === '1'
}

function navigationHref(): string | null {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null
    const entry = performance.getEntriesByType('navigation')[0] as { name?: string } | undefined
    return entry?.name ?? null
  } catch {
    return null
  }
}

/**
 * `?nopip=1` 关掉画中画。地址栏同步会抹掉未知参数，所以同时看导航记录里的原始地址。
 * 不读全屏开关。
 */
export function pipDisabled(search?: string, navigationHrefOverride?: string | null): boolean {
  const current = search ?? (typeof location === 'undefined' ? '' : location.search)
  if (pipOffFromSearch(current)) return true
  const href = navigationHrefOverride === undefined ? navigationHref() : navigationHrefOverride
  if (!href) return false
  try {
    return pipOffFromSearch(new URL(href).search)
  } catch {
    return false
  }
}

/** 显式 false 才当不支持。方法都没有则不能进画中画。 */
export function pipApiAvailable(host: {
  pictureInPictureEnabled?: boolean
  requestPictureInPicture?: unknown
} | null): boolean {
  if (!host) return false
  if (host.pictureInPictureEnabled === false) return false
  return typeof host.requestPictureInPicture === 'function'
}

/** 静默：不自动播放，也不允许浏览器自己拉起画中画。 */
export function applySilentVideo(video: SilentVideoSink): void {
  video.muted = true
  video.controls = false
  video.autoplay = false
  video.playsInline = true
  video.disablePictureInPicture = false
  try {
    video.volume = 0
  } catch {
    // 个别媒体元素在还没挂上画面时拒绝写音量。
  }
}
