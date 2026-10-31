/**
 * 用户可感镜头过渡。camera-controls 的 smoothTime（秒）：
 * 大约一秒内能看出在动，不是跳切；阻尼收尾仍交给 rest / invalidate。
 * 爆炸收拢、窗口缩放、地址栏初次落点保持瞬时，避免 fitToBox 的距离上限和极角被动画拆开。
 */
export const USER_CAMERA_SMOOTH_TIME = 0.42

/**
 * demand 下开过渡前可能空出一整秒。camera-controls 的 update(delta) 会把这段空档一次吃完，
 * 过渡就变成跳切。单帧最多推进 0.1 秒，把空档拆开；正常帧间隔小于这个值，墙钟不被放慢。
 */
export const CAMERA_UPDATE_DELTA_CAP = 0.1

export function clampControlDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.min(delta, CAMERA_UPDATE_DELTA_CAP)
}

export interface CameraSnap {
  view: string
  cam: string | null
  spread: boolean
  width: number
  height: number
}

/** 总览上的用户路径。null 表示这一帧仍要瞬时落位。 */
export type UserCameraMove = 'back-overview' | 'pose'

/** 视点、机位、爆炸和画布尺寸都没变。fitGeneration 一类依赖抖动不该重放瞬时落位。 */
export function sameCameraIntent(prev: CameraSnap | null, next: CameraSnap): boolean {
  if (prev == null) return false
  return (
    prev.view === next.view &&
    prev.cam === next.cam &&
    prev.spread === next.spread &&
    prev.width === next.width &&
    prev.height === next.height
  )
}

export function userCameraMove(input: {
  presented: boolean
  prev: CameraSnap | null
  next: CameraSnap
}): UserCameraMove | null {
  const { presented, prev, next } = input
  if (!presented || prev == null) return null
  if (prev.view === 'floor' && next.view === 'building') return 'back-overview'
  if (prev.view !== 'building' || next.view !== 'building') return null
  // 爆炸和缩放都要当场重算 fitToBox，不能边飞边改距离上限。
  if (prev.spread !== next.spread) return null
  if (prev.width !== next.width || prev.height !== next.height) return null
  if (prev.cam !== next.cam) return 'pose'
  return null
}

/**
 * 进层取景：场景已经出过帧、而且楼层或工位变了，才滑过去。
 * 冷启动直达和纯缩放仍瞬时，空帧闸和 fit 比例保持原样。
 */
export function floorFramingGlide(input: {
  seen: boolean
  targetChanged: boolean
  resizeOnly: boolean
}): boolean {
  return input.seen && input.targetChanged && !input.resizeOnly
}

/**
 * 楼层工位爆炸的 fit 节流、落定和导览让路在 explodeFitGate.ts。
 * 和这里共用同一条口径：爆炸 fitToBox 不打开过渡，避免距离上限和极角被拆开。
 * 进度 scrub 与炸开落定走同一道门。那个文件只有楼层相机引用，不进首屏。
 */
