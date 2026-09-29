import { Environment } from '@react-three/drei/core/Environment'

/**
 * Poly Haven CC0，Kloofendal 48d Partly Cloudy (Pure Sky) 1k。
 * 不传 background，避免天空再占一次绘制。
 */
export const OUTDOOR_HDR_URL = '/hdr/kloofendal_48d_partly_cloudy_puresky_1k.hdr'

export function LocalEnvironment({ enabled, night }: { enabled: boolean; night: boolean }) {
  if (!enabled) return null
  // 晴天 HDR 的太阳很亮。压低场景环境强度，幕墙靠金属度和粗糙度映出天空，室内不会被照爆。
  return <Environment files={OUTDOOR_HDR_URL} environmentIntensity={night ? 0.16 : 0.58} />
}
