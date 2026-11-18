import { MeshStandardMaterial } from 'three'

/** T144：弧廊密肋间距。须明显密于原 1.8 m，且大于肋宽，避免融成实心板。 */
export const PODIUM_ARC_FIN_SPACING_M = 0.58
/** 沿墙法向伸出，让总览 / p2f003 能看见肋的厚度。 */
export const PODIUM_ARC_FIN_DEPTH_M = 0.38
/** 沿弧的肋宽。必须明显小于间距，才能读出竖向分格。 */
export const PODIUM_ARC_FIN_THICKNESS_M = 0.12

/**
 * 弧廊密肋专用材质，不改共享 finMaterial（塔楼 / 东楼 FinRow 也会变）。
 * 比日间 #c5cad3 更暗一点，提高与浅色裙房墙的对比。
 */
export const podiumArcFinMaterial = new MeshStandardMaterial({
  name: '裙房弧廊密肋',
  color: '#6f7682',
  roughness: 0.44,
  metalness: 0.4,
  envMapIntensity: 0.32,
})
