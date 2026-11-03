/**
 * T106：总览天空里的少量云。
 * 贴图在 public/textures/clouds，运行时只请求这条本地路径。
 * 不使用 drei 默认的 githack / CDN 地址，也不引入新的 npm。
 * speed 固定为 0：drei Cloud 的 useFrame 不会自己 invalidate，
 * 速度大于 0 时若要看见飘动就得连续要帧，demand 会被撑住。
 */

export const LOCAL_CLOUD_TEXTURE = '/textures/clouds/cloud.png'

export const OVERVIEW_CLOUD_SPEED = 0

export const OVERVIEW_CLOUD_GROWTH = 0

/** 近处淡出。总览机位远大于这个距离，云保持满不透明度。 */
export const OVERVIEW_CLOUD_FADE = 80

/**
 * 与软阴影、dock 同一道首帧后窗口。
 * 字面量写在这里，懒包不再去引那份带 three 的门闩模块。
 */
export const OVERVIEW_CLOUD_AFTER_FIRST_MS = 2600

export interface OverviewCloudSpec {
  seed: number
  segments: number
  position: [number, number, number]
  bounds: [number, number, number]
  volume: number
  opacity: number
  color: string
}

/**
 * 三团，都在塔楼屋顶（约 100 m）之上，落在总览机位看得到的天空里。
 * 机位拟合后大约在 y=220、z=430，y>155 的云会贴出画面上沿。
 * 段数收紧，limit 与段数之和相同，不按 drei 默认的 200 段去分配。
 */
export const OVERVIEW_CLOUDS: readonly OverviewCloudSpec[] = [
  {
    seed: 11,
    segments: 8,
    position: [-8, 136, -28],
    bounds: [34, 8, 18],
    volume: 48,
    opacity: 0.92,
    color: '#f7fbff',
  },
  {
    seed: 29,
    segments: 6,
    position: [108, 124, 16],
    bounds: [26, 7, 14],
    volume: 36,
    opacity: 0.78,
    color: '#f4f8fd',
  },
  {
    seed: 47,
    segments: 6,
    position: [-78, 128, 36],
    bounds: [24, 6, 14],
    volume: 28,
    opacity: 0.64,
    color: '#eef4fb',
  },
]

export const OVERVIEW_CLOUD_SEGMENTS = OVERVIEW_CLOUDS.reduce((sum, cloud) => sum + cloud.segments, 0)

export const OVERVIEW_CLOUD_LIMIT = OVERVIEW_CLOUD_SEGMENTS

export interface OverviewCloudGate {
  view: string
  dayNight: string
  presentation: string
}

/** 只在昼间总览的实景里画。夜景关掉，白模和蓝图也不挂。 */
export function overviewCloudsVisible(input: OverviewCloudGate): boolean {
  return input.view === 'building' && input.dayNight === 'day' && input.presentation === 'lit'
}

export function overviewCloudsChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= OVERVIEW_CLOUD_AFTER_FIRST_MS
}

/** 拒绝 http(s)、githack 和协议相对地址。只接受站内绝对路径。 */
export function localCloudTexture(url: string): boolean {
  if (!url.startsWith('/')) return false
  if (url.startsWith('//')) return false
  if (url.includes('://')) return false
  if (/githack|jsdelivr|unpkg|cdn\./i.test(url)) return false
  return url === LOCAL_CLOUD_TEXTURE
}
