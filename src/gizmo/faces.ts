/**
 * 总览方位。场景平面与机位同一套：+X 东，-Z 北，+Y 上。
 * 面序跟 drei 10.7.9 GizmoViewcube / three BoxGeometry 一致：
 * +X 东、-X 西、+Y 上、-Y 下、+Z 南、-Z 北。
 */
export const GIZMO_FACES = ['东', '西', '上', '下', '南', '北'] as const

export const NORTH_FACE = '北'
export const NORTH_FACE_INDEX = 5

/** 正上 / 正下没有水平分量。留一点原方位，避免 setLookAt 的上方向和视线平行。 */
const VERTICAL_LEAN = 1e-3

/**
 * drei Hud 在 renderPriority === 1 时会清屏重画主场景，盖掉同优先级的 EffectComposer，
 * 也和 MainScenePass 抢这一档。MonitorPass 占 2。方位块用 3，只清深度，叠在后处理之后。
 */
export const GIZMO_RENDER_PRIORITY = 3

export const GIZMO_FONT =
  '32px "WenQuanYi Micro Hei", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif'

export interface AxisDirection {
  x: number
  y: number
  z: number
}

/**
 * 面片在原点，用几何法线。棱和角的网格不在原点，位置才是朝向，不能用法线。
 */
export function directionFromGizmoClick(input: {
  objectX: number
  objectY: number
  objectZ: number
  normalX?: number
  normalY?: number
  normalZ?: number
}): AxisDirection | null {
  const { objectX, objectY, objectZ } = input
  if (objectX * objectX + objectY * objectY + objectZ * objectZ > 1e-8) {
    return { x: objectX, y: objectY, z: objectZ }
  }
  if (input.normalX == null || input.normalY == null || input.normalZ == null) return null
  if (input.normalX === 0 && input.normalY === 0 && input.normalZ === 0) return null
  return { x: input.normalX, y: input.normalY, z: input.normalZ }
}

/** 从注视点指向眼点的偏移。长度是当前距离，方向是点中的轴。 */
export function lookOffset(direction: AxisDirection, distance: number, fallbackAzimuth: number): AxisDirection {
  let x = direction.x
  let y = direction.y
  let z = direction.z
  if (Math.hypot(x, z) < 1e-4) {
    x = Math.sin(fallbackAzimuth) * VERTICAL_LEAN
    z = Math.cos(fallbackAzimuth) * VERTICAL_LEAN
  }
  const length = Math.hypot(x, y, z) || 1
  const span = Math.max(distance, 1e-3)
  return {
    x: (x / length) * span,
    y: (y / length) * span,
    z: (z / length) * span,
  }
}
