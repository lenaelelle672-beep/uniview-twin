/** 可分享视角。只含眼点、目标和焦距偏移，不含 smoothTime 等过渡参数。 */
export interface Viewpoint {
  px: number
  py: number
  pz: number
  tx: number
  ty: number
  tz: number
  fov: number
  fx: number
  fy: number
  fz: number
}

const SCALE = 1000

/** 毫米级。刷新回来的误差小于一像素。 */
export function roundViewpointMillimetre(value: number): number {
  return Math.round(value * SCALE) / SCALE
}

export function formatViewpoint(vp: Viewpoint): string | null {
  const nums = [vp.px, vp.py, vp.pz, vp.tx, vp.ty, vp.tz, vp.fov, vp.fx, vp.fy, vp.fz]
  if (nums.some((n) => !Number.isFinite(n))) return null
  return nums.map((n) => roundViewpointMillimetre(n).toString()).join('~')
}

function readComponent(part: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(part)) return Number.NaN
  return Number(part)
}

/** 7 段是眼点/目标/fov，10 段再加焦距偏移。非法返回 null。 */
export function parseViewpoint(raw: string): Viewpoint | null {
  const parts = raw.split('~')
  if (parts.length !== 7 && parts.length !== 10) return null
  const nums = parts.map(readComponent)
  if (nums.some((n) => !Number.isFinite(n))) return null
  const px = nums[0]
  const py = nums[1]
  const pz = nums[2]
  const tx = nums[3]
  const ty = nums[4]
  const tz = nums[5]
  const fov = nums[6]
  const fx = parts.length === 10 ? nums[7] : 0
  const fy = parts.length === 10 ? nums[8] : 0
  const fz = parts.length === 10 ? nums[9] : 0
  if (fov < 5 || fov > 120) return null
  if ([px, py, pz, tx, ty, tz, fx, fy, fz].some((n) => Math.abs(n) > 5000)) return null
  return { px, py, pz, tx, ty, tz, fov, fx, fy, fz }
}
