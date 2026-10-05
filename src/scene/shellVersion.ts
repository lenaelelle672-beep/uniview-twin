/**
 * 接触阴影的 key 跟外壳版本挂钩（D079）。
 * 外壳几何改版时把这个字符串加一，均衡档会重新烘一次。
 */
export const SHELL_VERSION = 'stack-0930-v1'

/** 场地最高面大约在 0.15～0.20 m。再低会和地面 z-fighting 出条纹。 */
export const CONTACT_SHADOW_Y = 0.22

/** 覆盖塔楼、裙房和东侧研发块。 */
export const CONTACT_SHADOW_POSITION: [number, number, number] = [45, CONTACT_SHADOW_Y, 35]
export const CONTACT_SHADOW_SCALE = 280
export const CONTACT_SHADOW_FAR = 24
export const CONTACT_SHADOW_RESOLUTION = 1024
