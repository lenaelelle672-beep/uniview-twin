/**
 * T074：工位屏 / 摄像头预览的纯数据。
 * 不引用三维库。屏幕局部坐标与 scene/stage/geometry.ts 的显示器一致，
 * 数字抄在这里，避免晚加载包把室内几何拖进来。
 */

/** 本地短片。观众地址默认不请求。不是流地址，也不是外链。 */
export const SCREEN_VIDEO_SRC = '/media/desk-cam.mp4'

/** 和告警屏同一层，合成器之后再画，避免被 AgX 压暗。 */
export const MONITOR_LAYER = 2

/** 高于告警屏（ALARM_MARKER_ORDER = 12），贴在屏幕前面。 */
export const SCREEN_RENDER_ORDER = 13

export const DESK_SCREEN_CAP = 3

/** 贴在屏幕盒正面之外，躲开深度打架。 */
export const FACE_GAP_M = 0.012

export const MONITOR_SCREEN_LOCAL = { x: 0, y: 1.02, z: -0.22 }
export const MONITOR_SCREEN_SIZE = { w: 0.52, h: 0.32, d: 0.028 }
export const MONITOR_SCREEN_TILT = -0.42

const DESK_FACE = { width: 0.46, height: 0.26 }
const CAMERA_FACE = { width: 0.28, height: 0.18 }
/** 预览面贴在工位屏右侧，仍在桌面上，不另找摄像头网格。 */
const CAMERA_SHIFT = { x: 0.64, y: -0.02 }

export type Mat4 = number[]

export interface ScreenPose {
  id: string
  kind: 'desk' | 'camera'
  elements: Mat4
  width: number
  height: number
}

export function screenVideoQueryOn(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (params.get('screenVideo') === '0') return false
  return params.get('screenVideo') === '1' || params.get('demoEdit') === '1'
}

export function screenVideoLayerOn(layers: object | null | undefined): boolean {
  if (!layers) return false
  return (layers as { screenVideo?: boolean }).screenVideo === true
}

export function searchOfUrl(url: string): string {
  const query = url.indexOf('?')
  if (query < 0) return ''
  const hash = url.indexOf('#', query)
  return url.slice(query, hash < 0 ? undefined : hash)
}

function tiltPoint(lx: number, ly: number, lz: number): { x: number; y: number; z: number } {
  const cos = Math.cos(MONITOR_SCREEN_TILT)
  const sin = Math.sin(MONITOR_SCREEN_TILT)
  return {
    x: MONITOR_SCREEN_LOCAL.x + lx,
    y: MONITOR_SCREEN_LOCAL.y + ly * cos - lz * sin,
    z: MONITOR_SCREEN_LOCAL.z + ly * sin + lz * cos,
  }
}

export function facePoint(kind: 'desk' | 'camera'): { x: number; y: number; z: number; width: number; height: number } {
  const lz = MONITOR_SCREEN_SIZE.d / 2 + FACE_GAP_M
  if (kind === 'camera') {
    const point = tiltPoint(CAMERA_SHIFT.x, CAMERA_SHIFT.y, lz)
    return { ...point, width: CAMERA_FACE.width, height: CAMERA_FACE.height }
  }
  const point = tiltPoint(0, 0, lz)
  return { ...point, width: DESK_FACE.width, height: DESK_FACE.height }
}

function mul(a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  const out = new Array<number>(16).fill(0)
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

function rotationX(angle: number): Mat4 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]
}

function translation(x: number, y: number, z: number): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]
}

function copy16(src: ArrayLike<number>, offset = 0): Mat4 {
  const out = new Array<number>(16)
  for (let i = 0; i < 16; i += 1) out[i] = src[offset + i] ?? 0
  return out
}

function poseMatrix(parent: ArrayLike<number>, instance: ArrayLike<number>, kind: 'desk' | 'camera'): Mat4 {
  const face = facePoint(kind)
  const local = mul(translation(face.x, face.y, face.z), rotationX(MONITOR_SCREEN_TILT))
  return mul(mul(parent, instance), local)
}

function dist2(x: number, y: number, z: number, camera: { x: number; y: number; z: number }): number {
  const dx = x - camera.x
  const dy = y - camera.y
  const dz = z - camera.z
  return dx * dx + dy * dy + dz * dz
}

/**
 * 从工位实例里挑离相机最近的几台，各贴一块工位屏。
 * 最近的那台再加一块摄像头预览，共用同一条本地短片。
 */
export function screenPosesFromInstances(
  parentElements: ArrayLike<number>,
  instanceArray: ArrayLike<number>,
  count: number,
  camera: { x: number; y: number; z: number },
): ScreenPose[] {
  if (count <= 0) return []
  const parent = copy16(parentElements)
  const ranked: Array<{ index: number; distance: number; instance: Mat4 }> = []
  for (let index = 0; index < count; index += 1) {
    const offset = index * 16
    if (offset + 16 > instanceArray.length) break
    const instance = copy16(instanceArray, offset)
    const world = mul(parent, instance)
    ranked.push({
      index,
      instance,
      distance: dist2(world[12] ?? 0, world[13] ?? 0, world[14] ?? 0, camera),
    })
  }
  ranked.sort((a, b) => a.distance - b.distance || a.index - b.index)
  const chosen = ranked.slice(0, DESK_SCREEN_CAP)
  const poses: ScreenPose[] = []
  for (const slot of chosen) {
    const face = facePoint('desk')
    poses.push({
      id: `desk-${slot.index}`,
      kind: 'desk',
      elements: poseMatrix(parent, slot.instance, 'desk'),
      width: face.width,
      height: face.height,
    })
  }
  const nearest = chosen[0]
  if (nearest) {
    const face = facePoint('camera')
    poses.push({
      id: `camera-${nearest.index}`,
      kind: 'camera',
      elements: poseMatrix(parent, nearest.instance, 'camera'),
      width: face.width,
      height: face.height,
    })
  }
  return poses
}

export function posesEqual(a: readonly ScreenPose[], b: readonly ScreenPose[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i]
    const right = b[i]
    if (!left || !right) return false
    if (left.id !== right.id || left.kind !== right.kind) return false
    if (left.width !== right.width || left.height !== right.height) return false
    for (let k = 0; k < 16; k += 1) {
      if (Math.abs((left.elements[k] ?? 0) - (right.elements[k] ?? 0)) > 1e-4) return false
    }
  }
  return true
}
